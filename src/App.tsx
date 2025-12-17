import { useState, useEffect } from "react";
import "./App.css";
import {
  AppConfig,
  ServerConfig,
  ProxyNode,
  CommonConfig,
} from "./types";
import * as api from "./api";

function App() {
  const [config, setConfig] = useState<AppConfig>({
    frpc_path: "/Volumes/SSD4T/dev/ChmlFrp/frpc",
    servers: [],
  });
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [showServerModal, setShowServerModal] = useState(false);
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null);
  const [editingNode, setEditingNode] = useState<ProxyNode | null>(null);
  const [logContent, setLogContent] = useState("");

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      config.servers.forEach((server) => {
        if (server.status === "running") {
          checkServerStatus(server.id);
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [config.servers]);

  const loadConfig = async () => {
    try {
      const loaded = await api.loadConfig();
      setConfig(loaded);
      if (loaded.servers.length > 0 && !selectedServerId) {
        setSelectedServerId(loaded.servers[0].id);
      }
    } catch (error) {
      console.error("Failed to load config:", error);
    }
  };

  const saveCurrentConfig = async () => {
    try {
      await api.saveConfig(config);
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  };

  const checkServerStatus = async (serverId: string) => {
    try {
      const status = await api.checkStatus(serverId);
      setConfig((prev) => ({
        ...prev,
        servers: prev.servers.map((s) =>
          s.id === serverId
            ? {
                ...s,
                status: status.is_running ? "running" : "stopped",
                pid: status.pid,
              }
            : s
        ),
      }));
    } catch (error) {
      console.error("Failed to check status:", error);
    }
  };

  const handleCreateServer = () => {
    const newServer: ServerConfig = {
      id: Date.now().toString(),
      name: "新服务器",
      common: {
        server_addr: "",
        server_port: 7000,
        tls_enable: false,
        user: "",
        token: "",
      },
      nodes: [],
      status: "stopped",
    };
    setEditingServer(newServer);
    setShowServerModal(true);
  };

  const handleEditServer = (server: ServerConfig) => {
    setEditingServer({ ...server });
    setShowServerModal(true);
  };

  const handleSaveServer = async () => {
    if (!editingServer) return;

    const exists = config.servers.find((s) => s.id === editingServer.id);
    let newConfig: AppConfig;

    if (exists) {
      newConfig = {
        ...config,
        servers: config.servers.map((s) =>
          s.id === editingServer.id ? editingServer : s
        ),
      };
    } else {
      newConfig = {
        ...config,
        servers: [...config.servers, editingServer],
      };
      setSelectedServerId(editingServer.id);
    }

    setConfig(newConfig);
    setShowServerModal(false);
    setEditingServer(null);

    try {
      await api.saveConfig(newConfig);
      await api.generateIni(editingServer, config.frpc_path);
    } catch (error) {
      console.error("Failed to save server:", error);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    if (!confirm("确定要删除这个服务器配置吗？")) return;

    const newConfig = {
      ...config,
      servers: config.servers.filter((s) => s.id !== serverId),
    };

    if (selectedServerId === serverId) {
      setSelectedServerId(newConfig.servers[0]?.id || null);
    }

    setConfig(newConfig);
    await api.saveConfig(newConfig);
  };

  const handleStartServer = async (serverId: string) => {
    const server = config.servers.find((s) => s.id === serverId);
    if (!server) return;

    try {
      await api.generateIni(server, config.frpc_path);
      const status = await api.startFrpc(serverId, config.frpc_path);
      
      setConfig((prev) => ({
        ...prev,
        servers: prev.servers.map((s) =>
          s.id === serverId
            ? { ...s, status: "running", pid: status.pid }
            : s
        ),
      }));
    } catch (error) {
      alert("启动失败: " + error);
    }
  };

  const handleStopServer = async (serverId: string) => {
    try {
      await api.stopFrpc(serverId);
      setConfig((prev) => ({
        ...prev,
        servers: prev.servers.map((s) =>
          s.id === serverId ? { ...s, status: "stopped", pid: undefined } : s
        ),
      }));
    } catch (error) {
      alert("停止失败: " + error);
    }
  };

  const handleCreateNode = () => {
    const newNode: ProxyNode = {
      name: "",
      type: "tcp",
      local_ip: "127.0.0.1",
      local_port: 22,
    };
    setEditingNode(newNode);
    setShowNodeModal(true);
  };

  const handleEditNode = (node: ProxyNode) => {
    setEditingNode({ ...node });
    setShowNodeModal(true);
  };

  const handleSaveNode = async () => {
    if (!editingNode || !selectedServerId) return;

    const server = config.servers.find((s) => s.id === selectedServerId);
    if (!server) return;

    const nodeExists = server.nodes.find((n) => n.name === editingNode.name);
    let updatedNodes: ProxyNode[];

    if (nodeExists) {
      updatedNodes = server.nodes.map((n) =>
        n.name === editingNode.name ? editingNode : n
      );
    } else {
      updatedNodes = [...server.nodes, editingNode];
    }

    const updatedServer = { ...server, nodes: updatedNodes };
    const newConfig = {
      ...config,
      servers: config.servers.map((s) =>
        s.id === selectedServerId ? updatedServer : s
      ),
    };

    setConfig(newConfig);
    setShowNodeModal(false);
    setEditingNode(null);

    await api.saveConfig(newConfig);
    await api.generateIni(updatedServer, config.frpc_path);
  };

  const handleDeleteNode = async (nodeName: string) => {
    if (!selectedServerId || !confirm("确定要删除这个节点吗？")) return;

    const server = config.servers.find((s) => s.id === selectedServerId);
    if (!server) return;

    const updatedServer = {
      ...server,
      nodes: server.nodes.filter((n) => n.name !== nodeName),
    };

    const newConfig = {
      ...config,
      servers: config.servers.map((s) =>
        s.id === selectedServerId ? updatedServer : s
      ),
    };

    setConfig(newConfig);
    await api.saveConfig(newConfig);
    await api.generateIni(updatedServer, config.frpc_path);
  };

  const handleViewLog = async (serverId: string) => {
    try {
      const log = await api.readLog(serverId, config.frpc_path);
      setLogContent(log);
      setShowLogModal(true);
    } catch (error) {
      alert("读取日志失败: " + error);
    }
  };

  const handleSelectFrpcPath = async () => {
    try {
      const path = await api.selectFrpcPath();
      const newConfig = { ...config, frpc_path: path };
      setConfig(newConfig);
      await api.saveConfig(newConfig);
    } catch (error) {
      console.error("Failed to select path:", error);
    }
  };

  const handleExportConfig = async () => {
    try {
      const path = await api.exportConfig();
      alert(`配置已导出到: ${path}`);
    } catch (error) {
      alert("导出配置失败: " + error);
    }
  };

  const handleImportConfig = async () => {
    try {
      const newConfig = await api.importConfig();
      setConfig(newConfig);
      setSelectedServerId(null);
      alert("配置已导入成功!");
    } catch (error) {
      alert("导入配置失败: " + error);
    }
  };

  const selectedServer = config.servers.find(
    (s) => s.id === selectedServerId
  );

  return (
    <div className="app-container">
      {/* 左侧服务器列表 */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>服务器列表</h2>
          <button className="btn btn-primary btn-small" onClick={handleCreateServer}>
            + 新建
          </button>
        </div>
        <div className="server-list">
          {config.servers.map((server) => (
            <div
              key={server.id}
              className={`server-card ${
                selectedServerId === server.id ? "active" : ""
              }`}
              onClick={() => setSelectedServerId(server.id)}
            >
              <div className="server-card-header">
                <span className="server-name">{server.name}</span>
                <span
                  className={`status-badge ${server.status || "stopped"}`}
                >
                  {server.status === "running" ? "运行中" : "已停止"}
                </span>
              </div>
              <div className="server-info">
                {server.common.server_addr}:{server.common.server_port}
              </div>
              <div className="server-info">节点数: {server.nodes.length}</div>
              <div className="server-actions">
                {server.status === "running" ? (
                  <button
                    className="btn btn-danger btn-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStopServer(server.id);
                    }}
                  >
                    停止
                  </button>
                ) : (
                  <button
                    className="btn btn-success btn-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartServer(server.id);
                    }}
                  >
                    启动
                  </button>
                )}
                <button
                  className="btn btn-secondary btn-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewLog(server.id);
                  }}
                >
                  日志
                </button>
                <button
                  className="btn btn-primary btn-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditServer(server);
                  }}
                >
                  编辑
                </button>
                <button
                  className="btn btn-danger btn-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteServer(server.id);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          {config.servers.length === 0 && (
            <div className="empty-state">
              <h3>暂无服务器</h3>
              <p>点击上方"新建"按钮创建第一个服务器配置</p>
            </div>
          )}
        </div>
      </div>

      {/* 右侧节点列表 */}
      <div className="main-content">
        <div className="content-header">
          <h1>{selectedServer?.name || "请选择服务器"}</h1>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={handleExportConfig}>
              📤 导出配置
            </button>
            <button className="btn btn-secondary" onClick={handleImportConfig}>
              📥 导入配置
            </button>
            <button className="btn btn-secondary" onClick={() => setShowSettingsModal(true)}>
              ⚙️ 设置
            </button>
            {selectedServer && (
              <button className="btn btn-primary" onClick={handleCreateNode}>
                + 新建节点
              </button>
            )}
          </div>
        </div>
        <div className="content-body">
          {selectedServer ? (
            selectedServer.nodes.length > 0 ? (
              <table className="nodes-table">
                <thead>
                  <tr>
                    <th>节点名称</th>
                    <th>类型</th>
                    <th>本地地址</th>
                    <th>本地端口</th>
                    <th>远程端口</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedServer.nodes.map((node) => (
                    <tr key={node.name}>
                      <td>{node.name}</td>
                      <td>{node.type}</td>
                      <td>{node.local_ip}</td>
                      <td>{node.local_port}</td>
                      <td>{node.remote_port || "-"}</td>
                      <td>
                        <button
                          className="btn btn-primary btn-small"
                          onClick={() => handleEditNode(node)}
                        >
                          编辑
                        </button>{" "}
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleDeleteNode(node.name)}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <h3>暂无节点</h3>
                <p>点击上方"新建节点"按钮添加代理节点</p>
              </div>
            )
          ) : (
            <div className="empty-state">
              <h3>未选择服务器</h3>
              <p>请从左侧选择或创建一个服务器配置</p>
            </div>
          )}
        </div>
      </div>

      {/* 服务器编辑模态框 */}
      {showServerModal && editingServer && (
        <div className="modal-overlay" onClick={() => setShowServerModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>编辑服务器配置</h2>
              <button className="btn btn-secondary btn-small" onClick={() => setShowServerModal(false)}>
                ✕
              </button>
            </div>
            <div>
              <div className="form-group">
                <label>服务器名称</label>
                <input
                  type="text"
                  value={editingServer.name}
                  onChange={(e) =>
                    setEditingServer({ ...editingServer, name: e.target.value })
                  }
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>服务器地址</label>
                  <input
                    type="text"
                    value={editingServer.common.server_addr}
                    onChange={(e) =>
                      setEditingServer({
                        ...editingServer,
                        common: { ...editingServer.common, server_addr: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>服务器端口</label>
                  <input
                    type="number"
                    value={editingServer.common.server_port}
                    onChange={(e) =>
                      setEditingServer({
                        ...editingServer,
                        common: {
                          ...editingServer.common,
                          server_port: parseInt(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>用户名</label>
                  <input
                    type="text"
                    value={editingServer.common.user}
                    onChange={(e) =>
                      setEditingServer({
                        ...editingServer,
                        common: { ...editingServer.common, user: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Token</label>
                  <input
                    type="text"
                    value={editingServer.common.token}
                    onChange={(e) =>
                      setEditingServer({
                        ...editingServer,
                        common: { ...editingServer.common, token: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={editingServer.common.tls_enable}
                    onChange={(e) =>
                      setEditingServer({
                        ...editingServer,
                        common: {
                          ...editingServer.common,
                          tls_enable: e.target.checked,
                        },
                      })
                    }
                  />
                  启用 TLS
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowServerModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSaveServer}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 节点编辑模态框 */}
      {showNodeModal && editingNode && (
        <div className="modal-overlay" onClick={() => setShowNodeModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>编辑节点配置</h2>
              <button className="btn btn-secondary btn-small" onClick={() => setShowNodeModal(false)}>
                ✕
              </button>
            </div>
            <div>
              <div className="form-group">
                <label>节点名称</label>
                <input
                  type="text"
                  value={editingNode.name}
                  onChange={(e) =>
                    setEditingNode({ ...editingNode, name: e.target.value })
                  }
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>类型</label>
                  <select
                    value={editingNode.type}
                    onChange={(e) =>
                      setEditingNode({ ...editingNode, type: e.target.value as any })
                    }
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>本地 IP</label>
                  <input
                    type="text"
                    value={editingNode.local_ip}
                    onChange={(e) =>
                      setEditingNode({ ...editingNode, local_ip: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>本地端口</label>
                  <input
                    type="number"
                    value={editingNode.local_port}
                    onChange={(e) =>
                      setEditingNode({
                        ...editingNode,
                        local_port: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>远程端口 (可选)</label>
                  <input
                    type="number"
                    value={editingNode.remote_port || ""}
                    onChange={(e) =>
                      setEditingNode({
                        ...editingNode,
                        remote_port: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowNodeModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSaveNode}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 日志查看模态框 */}
      {showLogModal && (
        <div className="modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>运行日志</h2>
              <button className="btn btn-secondary btn-small" onClick={() => setShowLogModal(false)}>
                ✕
              </button>
            </div>
            <div className="log-viewer">
              {logContent || "暂无日志"}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowLogModal(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 设置模态框 */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚙️ 应用设置</h2>
              <button className="btn btn-secondary btn-small" onClick={() => setShowSettingsModal(false)}>
                ✕
              </button>
            </div>
            <div>
              <div className="settings-section">
                <h3>FRPC 可执行文件路径</h3>
                <div className="form-group">
                  <label>当前路径</label>
                  <div className="path-selector">
                    <input
                      type="text"
                      value={config.frpc_path}
                      onChange={(e) => setConfig({ ...config, frpc_path: e.target.value })}
                      placeholder="/path/to/frpc"
                    />
                    <button className="btn btn-primary" onClick={handleSelectFrpcPath}>
                      📁 浏览
                    </button>
                  </div>
                  <small style={{ color: '#666', fontSize: '12px', marginTop: '5px', display: 'block' }}>
                    请选择 frpc 可执行文件的完整路径
                  </small>
                </div>
              </div>

              <div className="settings-section" style={{ marginTop: '20px' }}>
                <h3>下载 FRPC</h3>
                <div className="form-group">
                  <p style={{ color: '#666', fontSize: '14px', lineHeight: '1.6' }}>
                    如果您还没有 FRPC 客户端，可以从 GitHub 下载最新版本：
                  </p>
                  <a
                    href="https://github.com/fatedier/frp/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ textDecoration: 'none', display: 'inline-block', marginTop: '10px' }}
                  >
                    🔗 前往 GitHub 下载
                  </a>
                  <p style={{ color: '#999', fontSize: '12px', marginTop: '10px', lineHeight: '1.5' }}>
                    下载后解压，选择对应系统的 <code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>frpc</code> 可执行文件
                  </p>
                </div>
              </div>

              <div className="settings-section" style={{ marginTop: '20px' }}>
                <h3>关于通渡</h3>
                <div className="form-group">
                  <div style={{ padding: '15px', background: '#f9f9f9', borderRadius: '8px', lineHeight: '1.8' }}>
                    <p style={{ fontSize: '16px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
                      通渡 - FRP客户端
                    </p>
                    <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
                      一款优雅的内网穿透客户端管理工具，助您通达内外、渡越网络屏障。
                    </p>
                    <div style={{ fontSize: '13px', color: '#888', marginBottom: '6px' }}>
                      <strong>版本：</strong> v1.0.3
                    </div>
                    <div style={{ fontSize: '13px', color: '#888', marginBottom: '6px' }}>
                      <strong>作者：</strong> meetrice
                    </div>
                    <div style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
                      <strong>技术栈：</strong> Tauri 2.0 + React + TypeScript + Rust
                    </div>
                    <a
                      href="https://github.com/meetrice/tongdu-frp"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-small"
                      style={{ textDecoration: 'none', display: 'inline-block' }}
                    >
                      ⭐ GitHub 仓库
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSettingsModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={() => {
                saveCurrentConfig();
                setShowSettingsModal(false);
              }}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
