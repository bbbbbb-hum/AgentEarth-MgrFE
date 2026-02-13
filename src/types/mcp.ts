// MCP服务测试相关类型定义

// JSON Schema 类型
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

// MCP 工具定义
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JSONSchema;
}

// 服务器信息
export interface ServerInfo {
  name: string;
  version: string;
}

// 连接测试响应
export interface ConnectResponse {
  success: boolean;
  config_id?: number;
  wemcp_name?: string;
  service_url?: string;
  server_info?: ServerInfo;
  tools?: McpTool[];
  tools_count?: number;
  duration_ms?: number;
  error?: string;
}

// 工具调用响应
export interface CallResponse {
  success: boolean;
  tool_name?: string;
  content?: any;
  is_error?: boolean;
  duration_ms?: number;
  error?: string;
}

// 确认测试响应
export interface ConfirmResponse {
  config_id: number;
  wemcp_name: string;
  test_status: number;
  status_text: string;
}

// API 通用响应
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// 服务配置（列表项）
export interface ServiceConfig {
  Id: number;
  Name: string;
  CreateTime: string;
  UpdateTime: string;
  WemcpName: string;
  Tags: string;
  Description: string;
  AccountRequired: number;
  TestStatus: number;
  OnlineStatus: number;
}
