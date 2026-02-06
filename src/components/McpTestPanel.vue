<template>
  <div class="mcp-test-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <div class="header-left">
        <div class="header-title-group">
          <h2>MCP服务测试</h2>
          <span class="service-name">{{ serviceName }}</span>
        </div>
        <!-- 连接状态移到头部 -->
        <div class="connection-badge" :class="connectionStatus">
          <span class="status-dot"></span>
          <span class="status-text">{{ statusText }}</span>
        </div>
      </div>
      <button class="btn-close" @click="$emit('close')">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <!-- 连接前/连接失败状态 -->
    <div class="connection-overlay" v-if="connectionStatus !== 'connected'">
      <div class="connection-card">
        <div class="status-icon-large" :class="connectionStatus">
          <span v-if="connectionStatus === 'connecting'">⏳</span>
          <span v-else-if="connectionStatus === 'error'">❌</span>
          <span v-else>🔌</span>
        </div>
        <h3>{{ connectionStatus === 'connecting' ? '正在连接服务...' : (connectionStatus === 'error' ? '连接失败' : '准备连接') }}</h3>
        <p class="error-text" v-if="connectionError">{{ connectionError }}</p>
        
        <button 
          class="btn btn-primary btn-lg"
          :disabled="connecting"
          @click="connect"
        >
          {{ connecting ? '连接中...' : '开始连接' }}
        </button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content" v-else>
      <!-- 左侧工具列表 -->
      <div class="tools-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">工具列表</span>
          <span class="tool-count">{{ tools.length }}</span>
        </div>
        <div class="tools-list">
          <div 
            v-for="tool in tools" 
            :key="tool.name"
            class="tool-item"
            :class="{ active: selectedTool?.name === tool.name }"
            @click="selectTool(tool)"
          >
            <div class="tool-icon">🛠️</div>
            <div class="tool-info">
              <span class="tool-name">{{ tool.name }}</span>
              <span class="tool-summary" v-if="tool.description">{{ tool.description.slice(0, 30) }}{{ tool.description.length > 30 ? '...' : '' }}</span>
            </div>
            <div class="active-indicator"></div>
          </div>
        </div>
      </div>

      <!-- 右侧工具详情 -->
      <div class="tool-detail-container" v-if="selectedTool">
        <div class="tool-detail-content">
          <!-- 工具头部信息 -->
          <div class="tool-header-card">
            <div class="tool-title-row">
              <h3>{{ selectedTool.name }}</h3>
              <div class="tool-tags">
                <span class="tag">工具</span>
              </div>
            </div>
            <p class="tool-description" v-if="selectedTool.description">
              {{ selectedTool.description }}
            </p>
          </div>

          <!-- 参数配置区 -->
          <div class="tool-section">
            <div class="section-header">
              <h4>参数配置</h4>
              <span class="section-subtitle">Input Schema</span>
            </div>
            <div class="params-card">
              <SchemaForm 
                :schema="selectedTool.inputSchema" 
                v-model="toolArguments"
              />
            </div>
          </div>

          <!-- 操作栏 -->
          <div class="action-bar">
            <button 
              class="btn btn-primary btn-execute"
              :class="{ 'is-loading': calling }"
              :disabled="calling"
              @click="executeTool"
            >
              <span class="icon" v-if="!calling">▶</span>
              <span class="spinner" v-else></span>
              {{ calling ? '执行中...' : '执行调用' }}
            </button>
          </div>

          <!-- 执行结果 -->
          <div class="tool-section result-section" v-if="callResult !== null">
            <div class="section-header">
              <h4>执行结果</h4>
              <div class="result-meta" v-if="callResult.duration_ms">
                <span class="duration-badge">⏱ {{ callResult.duration_ms }}ms</span>
                <button class="btn-text" @click="copyResult">
                  <span class="icon">📋</span> 复制
                </button>
              </div>
            </div>
            <div 
              class="result-card"
              :class="{ error: callResult.is_error || !callResult.success }"
            >
              <div class="code-window-header">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
                <span class="window-title">Output</span>
              </div>
              <pre class="code-content">{{ formatResult(callResult) }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- 未选择工具提示 -->
      <div class="empty-selection" v-else>
        <div class="empty-content">
          <div class="empty-icon">👈</div>
          <h3>请选择一个工具</h3>
          <p>从左侧列表选择一个工具开始测试</p>
        </div>
      </div>
    </div>

    <!-- 底部操作区 -->
    <div class="panel-footer" v-if="connectionStatus === 'connected'">
      <div class="footer-left">
        <div class="server-info-pill" v-if="connectResult?.server_info">
          <span class="label">服务端:</span>
          <span class="value">{{ connectResult.server_info.name }} v{{ connectResult.server_info.version }}</span>
        </div>
      </div>
      <div class="footer-actions">
        <button class="btn btn-outline" @click="$emit('close')">取消</button>
        <button class="btn btn-danger" @click="confirmTest(-1)">测试失败</button>
        <button class="btn btn-success" @click="confirmTest(1)">测试通过</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SchemaForm from './SchemaForm.vue';
import { testConnect, testCall, testConfirm } from '../api/mcpTest';
import type { McpTool, ConnectResponse, CallResponse } from '../types/mcp';

const props = defineProps<{
  configId: number;
  serviceName: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirmed', status: number): void;
}>();

// 状态
const connecting = ref(false);
const calling = ref(false);
const connectionError = ref<string | null>(null);
const connectResult = ref<ConnectResponse | null>(null);
const tools = ref<McpTool[]>([]);
const selectedTool = ref<McpTool | null>(null);
const toolArguments = ref<Record<string, any>>({});
const callResult = ref<CallResponse | null>(null);

// 计算属性
const connectionStatus = computed(() => {
  if (connecting.value) return 'connecting';
  if (connectResult.value?.success) return 'connected';
  if (connectionError.value) return 'error';
  return 'disconnected';
});

const statusText = computed(() => {
  switch (connectionStatus.value) {
    case 'connecting': return '连接中...';
    case 'connected': return '已连接';
    case 'error': return '连接失败';
    default: return '未连接';
  }
});

// 连接服务
const connect = async () => {
  connecting.value = true;
  connectionError.value = null;
  
  try {
    const response = await testConnect(props.configId);
    
    if (response.code === 0 && response.data.success) {
      connectResult.value = response.data;
      tools.value = response.data.tools || [];
      // 自动选择第一个工具
      if (tools.value.length > 0) {
        selectTool(tools.value[0]);
      }
    } else {
      connectionError.value = response.data.error || response.message || '连接失败';
    }
  } catch (err: any) {
    connectionError.value = err.message || '网络错误';
  } finally {
    connecting.value = false;
  }
};

// 选择工具
const selectTool = (tool: McpTool) => {
  selectedTool.value = tool;
  toolArguments.value = {};
  callResult.value = null;
};

// 执行工具
const executeTool = async () => {
  if (!selectedTool.value) return;
  
  calling.value = true;
  callResult.value = null;
  
  try {
    const response = await testCall(
      props.configId,
      selectedTool.value.name,
      toolArguments.value
    );
    
    callResult.value = response.data;
  } catch (err: any) {
    callResult.value = {
      success: false,
      error: err.message || '调用失败'
    };
  } finally {
    calling.value = false;
  }
};

// 格式化结果
const formatResult = (result: CallResponse): string => {
  if (!result.success) {
    return `错误: ${result.error}`;
  }
  try {
    return JSON.stringify(result.content, null, 2);
  } catch {
    return String(result.content);
  }
};

// 复制结果
const copyResult = () => {
  if (callResult.value) {
    navigator.clipboard.writeText(formatResult(callResult.value));
    // 这里可以使用一个轻量级的提示组件，暂时用alert代替
    // alert('已复制到剪贴板');
  }
};

// 确认测试结果
const confirmTest = async (status: number) => {
  try {
    const response = await testConfirm(props.configId, status);
    
    if (response.code === 0) {
      emit('confirmed', status);
      emit('close');
    } else {
      alert('更新状态失败: ' + response.message);
    }
  } catch (err: any) {
    alert('操作失败: ' + err.message);
  }
};
</script>

<style scoped>
.mcp-test-panel {
  display: flex;
  flex-direction: column;
  height: 90vh; /* 增加高度 */
  max-height: 800px;
  width: 90vw;
  max-width: 1200px;
  background: #f8fafc;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

/* 头部样式 */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title-group h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.025em;
}

.service-name {
  padding: 4px 10px;
  background: #eff6ff;
  color: #2563eb;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid #dbeafe;
}

.connection-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
  background: #f1f5f9;
  color: #64748b;
  transition: all 0.3s ease;
}

.connection-badge.connected {
  background: #dcfce7;
  color: #15803d;
}

.connection-badge.connecting {
  background: #fef3c7;
  color: #b45309;
}

.connection-badge.error {
  background: #fee2e2;
  color: #b91c1c;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: currentColor;
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #f1f5f9;
  color: #475569;
}

/* 连接前遮罩 */
.connection-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
}

.connection-card {
  text-align: center;
  padding: 48px;
  background: #fff;
  border-radius: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  max-width: 400px;
  width: 100%;
}

.status-icon-large {
  font-size: 3rem;
  margin-bottom: 24px;
  display: inline-block;
  padding: 20px;
  background: #f1f5f9;
  border-radius: 50%;
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-icon-large.connecting {
  animation: pulse 2s infinite;
  background: #fef3c7;
}

.status-icon-large.error {
  background: #fee2e2;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
  100% { transform: scale(1); opacity: 1; }
}

.connection-card h3 {
  margin: 0 0 12px;
  font-size: 1.5rem;
  color: #0f172a;
}

.error-text {
  color: #ef4444;
  margin-bottom: 24px;
  padding: 12px;
  background: #fef2f2;
  border-radius: 8px;
  font-size: 0.9rem;
}

.btn-lg {
  padding: 12px 32px;
  font-size: 1.1rem;
  width: 100%;
}

/* 主布局 */
.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  background: #fff;
}

/* 侧边栏 */
.tools-sidebar {
  width: 280px;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar-title {
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
}

.tool-count {
  background: #e2e8f0;
  color: #64748b;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.tools-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.tool-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border: 1px solid transparent;
}

.tool-item:hover {
  background: #fff;
  border-color: #e2e8f0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.tool-item.active {
  background: #fff;
  border-color: #3b82f6;
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.1);
}

.tool-icon {
  font-size: 1.2rem;
  padding: 6px;
  background: #f1f5f9;
  border-radius: 6px;
}

.tool-item.active .tool-icon {
  background: #eff6ff;
}

.tool-info {
  flex: 1;
  overflow: hidden;
}

.tool-name {
  display: block;
  font-weight: 600;
  color: #334155;
  margin-bottom: 4px;
  font-size: 0.9rem;
}

.tool-item.active .tool-name {
  color: #2563eb;
}

.tool-summary {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 24px;
  background: #3b82f6;
  border-radius: 0 4px 4px 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.tool-item.active .active-indicator {
  opacity: 1;
}

/* 详情区 */
.tool-detail-container {
  flex: 1;
  background: #fff;
  overflow-y: auto;
  padding: 24px 40px;
}

.tool-detail-content {
  max-width: 800px;
  margin: 0 auto;
}

.tool-header-card {
  margin-bottom: 32px;
}

.tool-title-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.tool-title-row h3 {
  margin: 0;
  font-size: 1.75rem;
  color: #0f172a;
  font-weight: 700;
}

.tag {
  padding: 4px 12px;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.tool-description {
  font-size: 1rem;
  color: #475569;
  line-height: 1.6;
  margin: 0;
}

.tool-section {
  margin-bottom: 32px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 16px;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 8px;
}

.section-header h4 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #334155;
}

.section-subtitle {
  font-size: 0.8rem;
  color: #94a3b8;
  font-family: monospace;
}

.params-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.action-bar {
  margin-bottom: 32px;
  display: flex;
  justify-content: flex-end;
}

.btn-execute {
  padding: 12px 36px;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
  transition: all 0.2s;
}

.btn-execute:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.2);
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #ffffff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 结果区 */
.result-meta {
  display: flex;
  align-items: center;
  gap: 16px;
}

.duration-badge {
  font-size: 0.8rem;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 4px;
}

.btn-text {
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.btn-text:hover {
  background: #eff6ff;
}

.result-card {
  background: #1e293b;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

.code-window-header {
  background: #0f172a;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot.red { background: #ef4444; }
.dot.yellow { background: #f59e0b; }
.dot.green { background: #10b981; }

.window-title {
  margin-left: 12px;
  color: #64748b;
  font-family: monospace;
  font-size: 0.8rem;
}

.code-content {
  margin: 0;
  padding: 20px;
  color: #e2e8f0;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.9rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
}

.result-card.error .code-content {
  color: #fca5a5;
  background: #450a0a;
}

/* 空状态 */
.empty-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
}

.empty-content {
  text-align: center;
  color: #94a3b8;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 16px;
}

/* 底部 */
.panel-footer {
  padding: 16px 24px;
  background: #fff;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-left {
  display: flex;
  gap: 16px;
}

.server-info-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  font-size: 0.8rem;
}

.server-info-pill .label {
  color: #64748b;
}

.server-info-pill .value {
  color: #334155;
  font-weight: 600;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

/* 通用按钮 */
.btn {
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  padding: 8px 16px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #3b82f6;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-outline {
  background: transparent;
  border: 1px solid #cbd5e1;
  color: #475569;
}

.btn-outline:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.btn-success {
  background: #10b981;
  color: #fff;
}

.btn-success:hover {
  background: #059669;
}

.btn-danger {
  background: #ef4444;
  color: #fff;
}

.btn-danger:hover {
  background: #dc2626;
}
</style>
