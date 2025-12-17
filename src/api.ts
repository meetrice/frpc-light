import { invoke } from "@tauri-apps/api/core";
import { AppConfig, ServerConfig, ProxyNode, ProcessStatus } from "./types";

export async function saveConfig(config: AppConfig): Promise<void> {
  await invoke("save_config", { config });
}

export async function loadConfig(): Promise<AppConfig> {
  return await invoke("load_config");
}

export async function generateIni(
  server: ServerConfig,
  frpcPath: string
): Promise<string> {
  return await invoke("generate_ini", { server, frpcPath });
}

export async function startFrpc(
  serverId: string,
  frpcPath: string
): Promise<ProcessStatus> {
  return await invoke("start_frpc", { serverId, frpcPath });
}

export async function stopFrpc(serverId: string): Promise<ProcessStatus> {
  return await invoke("stop_frpc", { serverId });
}

export async function checkStatus(serverId: string): Promise<ProcessStatus> {
  return await invoke("check_status", { serverId });
}

export async function readLog(
  serverId: string,
  frpcPath: string
): Promise<string> {
  return await invoke("read_log", { serverId, frpcPath });
}

export async function selectFrpcPath(): Promise<string> {
  return await invoke("select_frpc_path");
}

export async function exportConfig(): Promise<string> {
  return await invoke("export_config");
}

export async function importConfig(): Promise<AppConfig> {
  return await invoke("import_config");
}
