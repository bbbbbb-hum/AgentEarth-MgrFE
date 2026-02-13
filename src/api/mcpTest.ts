// MCP服务测试 API

import { apiBaseUrl, authorizedFetch } from '../http';
import type { ApiResponse, ConnectResponse, CallResponse, ConfirmResponse } from '../types/mcp';

const BASE_PATH = `${apiBaseUrl}api/admin/mcp/service/test`;

/**
 * 连接测试 - 获取工具列表
 */
export async function testConnect(configId: number, timeout?: number): Promise<ApiResponse<ConnectResponse>> {
  const response = await authorizedFetch(`${BASE_PATH}/connect`, {
    method: 'POST',
    body: JSON.stringify({
      config_id: configId,
      timeout: timeout || 30
    })
  });
  return response.json();
}

/**
 * 调用工具
 */
export async function testCall(
  configId: number, 
  toolName: string, 
  args: Record<string, any>,
  timeout?: number
): Promise<ApiResponse<CallResponse>> {
  const response = await authorizedFetch(`${BASE_PATH}/call`, {
    method: 'POST',
    body: JSON.stringify({
      config_id: configId,
      tool_name: toolName,
      arguments: JSON.stringify(args),
      timeout: timeout || 30
    })
  });
  return response.json();
}

/**
 * 确认测试结果
 */
export async function testConfirm(
  configId: number, 
  testStatus: number
): Promise<ApiResponse<ConfirmResponse>> {
  const response = await authorizedFetch(`${BASE_PATH}/confirm`, {
    method: 'POST',
    body: JSON.stringify({
      config_id: configId,
      test_status: testStatus
    })
  });
  return response.json();
}

/**
 * 断开连接 - 释放后端 MCP 会话
 */
export async function testDisconnect(configId: number): Promise<ApiResponse<{ success: boolean }>> {
  const response = await authorizedFetch(`${BASE_PATH}/disconnect`, {
    method: 'POST',
    body: JSON.stringify({ config_id: configId })
  });
  return response.json();
}
