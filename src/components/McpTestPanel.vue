<template>
  <div class="mcp-test-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <div class="header-left">
        <h2>MCP服务测试</h2>
        <span class="service-name">{{ serviceName }}</span>
      </div>
      <button class="btn-close" @click="$emit('close')">×</button>
    </div>

    <!-- 连接状态区 -->
    <div class="connection-section">
      <div class="connection-status" :class="connectionStatus">
        <span class="status-icon">{{ statusIcon }}</span>
        <span class="status-text">{{ statusText }}</span>
      </div>
      <div class="connection-info" v-if="connectResult">
        <div class="info-item" v-if="connectResult.service_url">
          <span class="info-label">服务地址:</span>
          <span class="info-value">{{ connectResult.service_url }}</span>
        </div>
        <div class="info-item" v-if="connectResult.server_info">
          <span class="info-label">服务信息:</span>
          <span class="info-value">{{ connectResult.server_info.name }} v{{ connectResult.server_info.version }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">工具数量:</span>
          <span class="info-value">{{ connectResult.tools_count || 0 }} 个</span>
        </div>
        <div class="info-item">
          <span class="info-label">连接耗时:</span>
          <span class="info-value">{{ connectResult.duration_ms || 0 }} ms</span>
        </div>
      </div>
      <div class="connection-error" v-if="connectionError">
        {{ connectionError }}
      </div>
      <button 
        v-if="connectionStatus !== 'connected'"
        class="btn btn-primary"
        :disabled="connecting"
        @click="connect"
      >
        {{ connecting ? '连接中...' : '连接服务' }}
      </button>
    </div>

    <!-- 主内容区 -->
    <div class="main-content" v-if="connectionStatus === 'connected'">
      <!-- 左侧工具列表 -->
      <div class="tools-sidebar">
        <div class="sidebar-header">工具列表</div>
        <div class="tools-list">
          <div 
            v-for="tool in tools" 
            :key="tool.name"
            class="tool-item"
            :class="{ active: selectedTool?.name === tool.name }"
            @click="selectTool(tool)"
          >
            <span class="tool-name">{{ tool.name }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧工具详情 -->
      <div class="tool-detail" v-if="selectedTool">
        <div class="detail-header">
          <h3>{{ selectedTool.name }}</h3>
          <p class="tool-description" v-if="selectedTool.description">
            {{ selectedTool.description }}
          </p>
        </div>

        <!-- 参数表单 -->
        <div class="params-section">
          <div class="section-title">参数</div>
          <SchemaForm 
            :schema="selectedTool.inputSchema" 
            v-model="toolArguments"
          />
        </div>

        <!-- 执行按钮 -->
        <div class="execute-section">
          <button 
            class="btn btn-primary btn-execute"
            :disabled="calling"
            @click="executeTool"
          >
            {{ calling ? '执行中...' : '执行' }}
          </button>
        </div>

        <!-- 结果展示 -->
        <div class="result-section" v-if="callResult !== null">
          <div class="section-title">
            执行结果
            <span class="result-time" v-if="callResult.duration_ms">
              ({{ callResult.duration_ms }}ms)
            </span>
          </div>
          <div 
            class="result-content"
            :class="{ error: callResult.is_error || !callResult.success }"
          >
            <pre>{{ formatResult(callResult) }}</pre>
          </div>
          <button class="btn btn-sm btn-copy" @click="copyResult">
            复制结果
          </button>
        </div>
      </div>

      <!-- 未选择工具提示 -->
      <div class="no-tool-selected" v-else>
        <p>请从左侧选择一个工具</p>
      </div>
    </div>

    <!-- 底部操作区 -->
    <div class="panel-footer" v-if="connectionStatus === 'connected'">
      <button class="btn btn-success" @click="confirmTest(1)">
        ✓ 测试通过
      </button>
      <button class="btn btn-danger" @click="confirmTest(-1)">
        ✗ 测试失败
      </button>
      <button class="btn btn-secondary" @click="$emit('close')">
        关闭
      </button>
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

const statusIcon = computed(() => {
  switch (connectionStatus.value) {
    case 'connecting': return '⏳';
    case 'connected': return '✓';
    case 'error': return '✗';
    default: return '○';
  }
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
    alert('已复制到剪贴板');
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
  height: 100%;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

/* 头部 */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-left h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #1e293b;
}

.service-name {
  padding: 4px 12px;
  background: #e0e7ff;
  color: #4338ca;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
}

.btn-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 1.5rem;
  color: #64748b;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #f1f5f9;
  color: #334155;
}

/* 连接状态区 */
.connection-section {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.status-icon {
  font-size: 1.1rem;
}

.connection-status.disconnected .status-icon { color: #9ca3af; }
.connection-status.connecting .status-icon { color: #f59e0b; }
.connection-status.connected .status-icon { color: #10b981; }
.connection-status.error .status-icon { color: #ef4444; }

.status-text {
  font-weight: 500;
  color: #374151;
}

.connection-info {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.info-item {
  display: flex;
  gap: 8px;
  font-size: 0.85rem;
}

.info-label {
  color: #64748b;
}

.info-value {
  color: #1e293b;
  font-weight: 500;
}

.connection-error {
  padding: 12px;
  background: #fef2f2;
  color: #dc2626;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 0.9rem;
}

/* 主内容区 */
.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 工具列表侧边栏 */
.tools-sidebar {
  width: 200px;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 12px 16px;
  font-weight: 600;
  color: #374151;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.tools-list {
  flex: 1;
  overflow-y: auto;
}

.tool-item {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  transition: all 0.2s;
}

.tool-item:hover {
  background: #f8fafc;
}

.tool-item.active {
  background: #eff6ff;
  border-left: 3px solid #3b82f6;
}

.tool-name {
  font-size: 0.9rem;
  color: #1e293b;
  word-break: break-all;
}

/* 工具详情 */
.tool-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.detail-header h3 {
  margin: 0 0 8px 0;
  font-size: 1rem;
  color: #1e293b;
}

.tool-description {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
}

.params-section,
.result-section {
  padding: 16px 20px;
}

.section-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-time {
  font-weight: normal;
  color: #64748b;
  font-size: 0.85rem;
}

.execute-section {
  padding: 0 20px 16px;
}

.btn-execute {
  width: 100%;
}

.result-section {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-top: 1px solid #e2e8f0;
}

.result-content {
  flex: 1;
  overflow: auto;
  background: #f8fafc;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.result-content.error {
  background: #fef2f2;
}

.result-content pre {
  margin: 0;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-all;
}

.btn-copy {
  align-self: flex-start;
}

.no-tool-selected {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}

/* 底部操作区 */
.panel-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

/* 按钮样式 */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.85rem;
}

.btn-primary {
  background: #3b82f6;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-success {
  background: #10b981;
  color: #fff;
}

.btn-success:hover:not(:disabled) {
  background: #059669;
}

.btn-danger {
  background: #ef4444;
  color: #fff;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn-secondary:hover:not(:disabled) {
  background: #d1d5db;
}

.btn-copy {
  background: #f1f5f9;
  color: #475569;
}

.btn-copy:hover {
  background: #e2e8f0;
}
</style>
