use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use parking_lot::Mutex;
use tauri::{Manager, State};

// 数据结构定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommonConfig {
    pub server_addr: String,
    pub server_port: u16,
    pub tls_enable: bool,
    pub user: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyNode {
    pub name: String,
    #[serde(rename = "type")]
    pub proxy_type: String,
    pub local_ip: String,
    pub local_port: u16,
    pub remote_port: Option<u16>,
    pub custom_domains: Option<String>,
    pub subdomain: Option<String>,
    pub use_encryption: Option<bool>,
    pub use_compression: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub common: CommonConfig,
    pub nodes: Vec<ProxyNode>,
    #[serde(skip)]
    pub status: Option<String>,
    #[serde(skip)]
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub frpc_path: String,
    pub servers: Vec<ServerConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessStatus {
    pub is_running: bool,
    pub pid: Option<u32>,
    pub error: Option<String>,
}

// 进程管理器
pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<String, Child>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// Tauri 命令实现
#[tauri::command]
async fn save_config(config: AppConfig, app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    
    let config_path = app_dir.join("config.json");
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(config_path, json).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn load_config(app_handle: tauri::AppHandle) -> Result<AppConfig, String> {
    let app_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    
    let config_path = app_dir.join("config.json");
    
    if !config_path.exists() {
        return Ok(AppConfig {
            frpc_path: "/Volumes/SSD4T/dev/ChmlFrp/frpc".to_string(),
            servers: vec![],
        });
    }
    
    let json = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    let config: AppConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    
    Ok(config)
}

#[tauri::command]
async fn generate_ini(server: ServerConfig, frpc_path: String) -> Result<String, String> {
    let frpc_dir = Path::new(&frpc_path)
        .parent()
        .ok_or("Invalid frpc path")?;
    
    let ini_path = frpc_dir.join(format!("{}.ini", server.id));
    
    let mut content = String::new();
    
    // [common] 部分
    content.push_str("[common]\n");
    content.push_str(&format!("server_addr = {}\n", server.common.server_addr));
    content.push_str(&format!("server_port = {}\n", server.common.server_port));
    content.push_str(&format!("tls_enable = {}\n", server.common.tls_enable));
    content.push_str(&format!("user = {}\n", server.common.user));
    content.push_str(&format!("token = {}\n", server.common.token));
    content.push_str("\n");
    
    // 各个代理节点
    for node in &server.nodes {
        content.push_str(&format!("[{}]\n", node.name));
        content.push_str(&format!("type = {}\n", node.proxy_type));
        content.push_str(&format!("local_ip = {}\n", node.local_ip));
        content.push_str(&format!("local_port = {}\n", node.local_port));
        
        if let Some(remote_port) = node.remote_port {
            content.push_str(&format!("remote_port = {}\n", remote_port));
        }
        if let Some(ref custom_domains) = node.custom_domains {
            content.push_str(&format!("custom_domains = {}\n", custom_domains));
        }
        if let Some(ref subdomain) = node.subdomain {
            content.push_str(&format!("subdomain = {}\n", subdomain));
        }
        if let Some(use_encryption) = node.use_encryption {
            content.push_str(&format!("use_encryption = {}\n", use_encryption));
        }
        if let Some(use_compression) = node.use_compression {
            content.push_str(&format!("use_compression = {}\n", use_compression));
        }
        content.push_str("\n");
    }
    
    fs::write(&ini_path, content).map_err(|e| e.to_string())?;
    
    Ok(ini_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn start_frpc(
    server_id: String,
    frpc_path: String,
    process_manager: State<'_, ProcessManager>,
) -> Result<ProcessStatus, String> {
    let frpc_dir = Path::new(&frpc_path)
        .parent()
        .ok_or("Invalid frpc path")?;
    
    let ini_path = frpc_dir.join(format!("{}.ini", server_id));
    let log_path = frpc_dir.join(format!("{}.out", server_id));
    
    if !ini_path.exists() {
        return Err("Configuration file not found".to_string());
    }
    
    // 检查是否已经在运行
    {
        let processes = process_manager.processes.lock();
        if processes.contains_key(&server_id) {
            return Err("Process already running".to_string());
        }
    }
    
    let log_file = fs::File::create(&log_path).map_err(|e| e.to_string())?;
    
    let child = Command::new(&frpc_path)
        .arg("-c")
        .arg(&ini_path)
        .stdout(Stdio::from(log_file.try_clone().map_err(|e| e.to_string())?))
        .stderr(Stdio::from(log_file))
        .spawn()
        .map_err(|e| e.to_string())?;
    
    let pid = child.id();
    
    {
        let mut processes = process_manager.processes.lock();
        processes.insert(server_id.clone(), child);
    }
    
    Ok(ProcessStatus {
        is_running: true,
        pid: Some(pid),
        error: None,
    })
}

#[tauri::command]
async fn stop_frpc(
    server_id: String,
    process_manager: State<'_, ProcessManager>,
) -> Result<ProcessStatus, String> {
    let mut processes = process_manager.processes.lock();
    
    if let Some(mut child) = processes.remove(&server_id) {
        child.kill().map_err(|e| e.to_string())?;
        child.wait().map_err(|e| e.to_string())?;
        
        Ok(ProcessStatus {
            is_running: false,
            pid: None,
            error: None,
        })
    } else {
        Err("Process not found".to_string())
    }
}

#[tauri::command]
async fn check_status(
    server_id: String,
    process_manager: State<'_, ProcessManager>,
) -> Result<ProcessStatus, String> {
    let mut processes = process_manager.processes.lock();
    
    if let Some(child) = processes.get_mut(&server_id) {
        match child.try_wait() {
            Ok(Some(_)) => {
                // 进程已退出
                processes.remove(&server_id);
                Ok(ProcessStatus {
                    is_running: false,
                    pid: None,
                    error: Some("Process exited".to_string()),
                })
            }
            Ok(None) => {
                // 进程仍在运行
                Ok(ProcessStatus {
                    is_running: true,
                    pid: Some(child.id()),
                    error: None,
                })
            }
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok(ProcessStatus {
            is_running: false,
            pid: None,
            error: None,
        })
    }
}

#[tauri::command]
async fn read_log(server_id: String, frpc_path: String) -> Result<String, String> {
    let frpc_dir = Path::new(&frpc_path)
        .parent()
        .ok_or("Invalid frpc path")?;
    
    let log_path = frpc_dir.join(format!("{}.out", server_id));
    
    if !log_path.exists() {
        return Ok(String::new());
    }
    
    fs::read_to_string(log_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn select_frpc_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let file_path = app_handle
        .dialog()
        .file()
        .blocking_pick_file();
    
    match file_path {
        Some(path) => {
            if let Some(p) = path.as_path() {
                Ok(p.to_string_lossy().to_string())
            } else {
                Err("Invalid file path".to_string())
            }
        },
        None => Err("No file selected".to_string()),
    }
}

#[tauri::command]
async fn export_config(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    
    // 读取当前配置
    let app_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    
    let config_path = app_dir.join("config.json");
    let config_content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    
    // 选择保存位置
    let save_path = app_handle
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name("tongdu-config.json")
        .blocking_save_file();
    
    match save_path {
        Some(path) => {
            if let Some(p) = path.as_path() {
                fs::write(p, config_content).map_err(|e| e.to_string())?;
                Ok(p.to_string_lossy().to_string())
            } else {
                Err("Invalid file path".to_string())
            }
        },
        None => Err("No file selected".to_string()),
    }
}

#[tauri::command]
async fn import_config(app_handle: tauri::AppHandle) -> Result<AppConfig, String> {
    use tauri_plugin_dialog::DialogExt;
    
    // 选择导入文件
    let file_path = app_handle
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();
    
    match file_path {
        Some(path) => {
            if let Some(p) = path.as_path() {
                let json = fs::read_to_string(p).map_err(|e| e.to_string())?;
                let config: AppConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;
                
                // 保存到应用配置目录
                let app_dir = app_handle
                    .path()
                    .app_config_dir()
                    .map_err(|e| e.to_string())?;
                
                fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
                let config_path = app_dir.join("config.json");
                let json_pretty = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
                fs::write(config_path, json_pretty).map_err(|e| e.to_string())?;
                
                Ok(config)
            } else {
                Err("Invalid file path".to_string())
            }
        },
        None => Err("No file selected".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ProcessManager::new())
        .invoke_handler(tauri::generate_handler![
            save_config,
            load_config,
            generate_ini,
            start_frpc,
            stop_frpc,
            check_status,
            read_log,
            select_frpc_path,
            export_config,
            import_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

