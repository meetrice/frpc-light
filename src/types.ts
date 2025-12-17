// FRPC 配置数据类型定义

export interface CommonConfig {
  server_addr: string;
  server_port: number;
  tls_enable: boolean;
  user: string;
  token: string;
}

export interface ProxyNode {
  name: string;
  type: 'tcp' | 'udp' | 'http' | 'https' | 'stcp' | 'xtcp';
  local_ip: string;
  local_port: number;
  remote_port?: number;
  custom_domains?: string;
  subdomain?: string;
  use_encryption?: boolean;
  use_compression?: boolean;
}

export interface ServerConfig {
  id: string;
  name: string;
  common: CommonConfig;
  nodes: ProxyNode[];
  status?: 'running' | 'stopped' | 'error';
  pid?: number;
}

export interface AppConfig {
  frpc_path: string;
  servers: ServerConfig[];
}

export interface ProcessStatus {
  is_running: boolean;
  pid?: number;
  error?: string;
}
