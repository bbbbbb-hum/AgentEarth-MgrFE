<template>
  <div class="mcp-test-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <div class="header-left">
        <div class="icon-wrapper">
          <span class="header-icon">🔌</span>
        </div>
        <div class="header-info">
          <h2>MCP 服务测试台</h2>
          <div class="header-meta">
            <span class="service-name">{{ serviceName }}</span>
            <div class="connection-badge" :class="connectionStatus">
              <span class="status-dot"></span>
              <span class="status-text">{{ statusText }}</span>
            </div>
          </div>
        </div>
      </div>
      <button class="btn-close" @click="$emit('close')" title="关闭">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <!-- 连接前/连接失败状态 -->
    <div class="connection-overlay" v-if="connectionStatus !== 'connected'">
      <div class="connection-card">
        <div class="status-visual" :class="connectionStatus">
          <div class="pulse-ring" v-if="connectionStatus === 'connecting'"></div>
          <span class="visual-icon" v-if="connectionStatus === 'connecting'">⏳</span>
          <span class="visual-icon" v-else-if="connectionStatus === 'error'">⚠️</span>
          <span class="visual-icon" v-else>🚀</span>
        </div>
        <h3>{{ connectionStatus === 'connecting' ? '正在建立连接...' : (connectionStatus === 'error' ? '连接中断' : '准备就绪') }}</h3>
        <p class="status-desc" v-if="!connectionError">
          {{ connectionStatus === 'connecting' ? '请稍候，正在尝试连接到 MCP 服务' : '点击下方按钮开始测试连接' }}
        </p>
        <div class="error-box" v-if="connectionError">
          <span class="error-icon">❌</span>
          <span class="error-msg">{{ connectionError }}</span>
        </div>
        
        <button 
          class="btn btn-primary btn-lg btn-glow"
          :disabled="connecting"
          @click="connect"
        >
          {{ connecting ? '连接中...' : '开始连接' }}
        </button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content" v-else>
      <!-- 左侧工具列表 (侧边栏) -->
      <div class="tools-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">可用工具</span>
          <span class="tool-count-badge">{{ tools.length }}</span>
        </div>
        
        <div class="tools-list custom-scrollbar">
          <div 
            v-for="tool in tools" 
            :key="tool.name"
            class="tool-item"
            :class="{ active: selectedTool?.name === tool.name }"
            @click="selectTool(tool)"
          >
            <div class="tool-icon-wrapper">
              <span class="tool-icon">🛠️</span>
            </div>
            <div class="tool-info">
              <span class="tool-name">{{ tool.name }}</span>
              <span class="tool-summary" v-if="tool.description">{{ tool.description }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧工作台 (上下布局) -->
      <div class="tool-workbench" v-if="selectedTool">
        <!-- 上半部分：配置与执行 (Flex 1) -->
        <div class="workbench-top custom-scrollbar">
          <div class="tool-header">
            <div class="tool-title-row">
              <h3>{{ selectedTool.name }}</h3>
              <span class="tag">Function</span>
            </div>
            <p class="tool-description" v-if="selectedTool.description">
              {{ selectedTool.description }}
            </p>
          </div>

          <div class="tool-config">
            <div class="section-header">
              <h4>参数配置</h4>
              <span class="section-line"></span>
            </div>
            <div class="params-container">
              <SchemaForm 
                :schema="selectedTool.inputSchema" 
                v-model="toolArguments"
              />
            </div>
          </div>
        </div>

        <!-- 中间：操作栏 (固定在上下分栏之间) -->
        <div class="action-bar-divider">
            <button 
            class="btn btn-primary btn-block btn-md btn-glow"
            :class="{ 'is-loading': calling }"
            :disabled="calling"
            @click="executeTool"
          >
            <span class="icon" v-if="!calling">▶</span>
            <span class="spinner" v-else></span>
            {{ calling ? '执行中...' : '运行工具' }}
          </button>
        </div>

        <!-- 下半部分：终端输出 (Flex 0 0 auto) -->
        <div class="workbench-bottom">
          <div class="terminal-header">
            <div class="terminal-controls">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
            </div>
            <span class="terminal-title">Terminal Output</span>
            <div class="terminal-actions">
              <span class="duration-badge" v-if="callResult?.duration_ms">
                ⏱ {{ callResult.duration_ms }}ms
              </span>
              <button class="btn-icon-sm" @click="copyResult" title="复制结果" v-if="callResult">
                📋
              </button>
            </div>
          </div>
          
          <div class="terminal-body custom-scrollbar">
            <div v-if="callResult" class="result-content" :class="{ error: callResult.is_error || !callResult.success }">
              <div class="result-line timestamp">
                <span class="prompt">➜</span> 
                <span class="cmd">executed {{ selectedTool.name }}</span>
                <span class="time">@ {{ new Date().toLocaleTimeString() }}</span>
              </div>
              <pre class="code-block">{{ formatResult(callResult) }}</pre>
            </div>
            
            <div v-else-if="calling" class="terminal-placeholder calling">
              <div class="spinner-large"></div>
              <p>正在等待服务响应...</p>
            </div>
            
            <div v-else class="terminal-placeholder">
              <div class="placeholder-visual">⌨️</div>
              <p>准备就绪</p>
              <span class="sub-text">在上方配置参数并运行以查看结果</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 未选择工具提示 -->
      <div class="empty-selection" v-else>
        <div class="empty-content">
          <div class="empty-illustration">👈</div>
          <h3>选择一个工具</h3>
          <p>从左侧列表中选择一个工具以开始测试</p>
        </div>
      </div>
    </div>

    <!-- 底部操作区 (全局) -->
    <div class="panel-footer" v-if="connectionStatus === 'connected'">
      <div class="footer-left">
        <div class="server-info-pill" v-if="connectResult?.server_info">
          <span class="status-indicator online"></span>
          <span class="server-name">{{ connectResult.server_info.name }}</span>
          <span class="server-version">v{{ connectResult.server_info.version }}</span>
        </div>
      </div>
      <div class="footer-actions">
        <button class="btn btn-text" @click="$emit('close')">关闭</button>
        <div class="action-group">
          <button class="btn btn-danger-soft" @click="confirmTest(-1)">❌ 测试失败</button>
          <button class="btn btn-success-soft" @click="confirmTest(1)">✅ 测试通过</button>
        </div>
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
    case 'connected': return '在线';
    case 'error': return '离线';
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
    return `Error: ${result.error}`;
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
/* 全局变量模拟 */
.mcp-test-panel {
  --primary: #3b82f6;
  --primary-dark: #2563eb;
  --primary-light: #eff6ff;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
  --bg-dark: #1e293b;
  --text-main: #1e293b;
  --text-secondary: #64748b;
  --border: #e2e8f0;
  
  display: flex;
  flex-direction: column;
  height: 95vh;
  max-height: none;
  width: 98vw;
  max-width: none;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.02);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--text-main);
}

/* 自定义滚动条 */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* 头部样式 */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-wrapper {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
}

.header-info h2 {
  margin: 0 0 4px;
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.service-name {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.connection-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  background: #f1f5f9;
  color: var(--text-secondary);
}

.connection-badge.connected { background: #dcfce7; color: #15803d; }
.connection-badge.connecting { background: #fef3c7; color: #b45309; }
.connection-badge.error { background: #fee2e2; color: #b91c1c; }

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}

.btn-close {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-close:hover {
  background: #f1f5f9;
  color: #64748b;
}

/* 连接前遮罩 */
.connection-overlay {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(to bottom, #f8fafc, #fff);
}

.connection-card {
  text-align: center;
  padding: 48px;
  background: #fff;
  border-radius: 24px;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.1);
  max-width: 420px;
  width: 100%;
  border: 1px solid #f1f5f9;
}

.status-visual {
  position: relative;
  width: 96px;
  height: 96px;
  margin: 0 auto 24px;
  background: #f1f5f9;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
}

.status-visual.connecting { background: #eff6ff; }
.status-visual.error { background: #fef2f2; }

.pulse-ring {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border-radius: 50%;
  border: 4px solid #3b82f6;
  opacity: 0;
  animation: pulse-ring 2s infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(1.5); opacity: 0; }
}

.connection-card h3 {
  margin: 0 0 12px;
  font-size: 1.5rem;
  color: #0f172a;
}

.status-desc {
  color: #64748b;
  margin-bottom: 32px;
}

.error-box {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 24px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
  font-size: 0.9rem;
}

/* 主布局 */
.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  background: #f8fafc;
}

/* 侧边栏 */
.tools-sidebar {
  width: 260px;
  background: #fff;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.sidebar-title {
  font-weight: 700;
  color: #334155;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tool-count-badge {
  background: #f1f5f9;
  color: #64748b;
  padding: 2px 8px;
  border-radius: 10px;
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
  padding: 10px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;
}

.tool-item:hover {
  background: #f8fafc;
}

.tool-item.active {
  background: #eff6ff;
  border-color: #dbeafe;
}

.tool-icon-wrapper {
  width: 32px;
  height: 32px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
}

.tool-item.active .tool-icon-wrapper {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.tool-info {
  flex: 1;
  overflow: hidden;
}

.tool-name {
  display: block;
  font-weight: 600;
  color: #334155;
  font-size: 0.85rem;
  margin-bottom: 2px;
  line-height: 1.4;
  word-break: break-all;
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

/* 工作台布局 (上下结构) */
.tool-workbench {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0; /* 防止flex子元素溢出 */
  height: 100%; /* 确保填满父容器 */
}

/* 上部：配置区域 */
.workbench-top {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: #fff;
  min-height: 0; /* 允许压缩 */
}

.tool-header {
  padding: 20px 24px 12px;
  flex-shrink: 0;
}

.tool-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.tool-title-row h3 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: #0f172a;
}

.tag {
  padding: 4px 8px;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}

.tool-description {
  font-size: 0.95rem;
  color: #475569;
  line-height: 1.6;
  margin: 0;
  max-width: 800px;
}

.tool-config {
  flex: 1;
  padding: 0 24px 20px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 16px;
}

.section-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #334155;
}

.section-line {
  flex: 1;
  height: 1px;
  background: #f1f5f9;
}

.params-container {
  max-width: 1000px; /* 限制最大宽度，保持阅读舒适度 */
}

/* 中间操作栏 */
.action-bar-divider {
  padding: 12px 24px;
  background: #fff;
  border-top: 1px solid #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  z-index: 5;
  flex-shrink: 0;
}

/* 下部：终端区域 */
.workbench-bottom {
  height: 250px; /* 固定高度，不再使用百分比 */
  min-height: 150px;
  max-height: 50%; /* 防止在大屏幕上过高，但在小屏幕上至少保证固定高度 */
  display: flex;
  flex-direction: column;
  background: #1e293b;
  color: #e2e8f0;
  flex-shrink: 0; /* 确保不被挤压 */
  border-top: 1px solid #334155;
}

/* 终端样式 */
.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: #0f172a;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}

.terminal-controls {
  display: flex;
  gap: 8px;
}

.terminal-title {
  font-family: 'Fira Code', monospace;
  font-size: 0.8rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.terminal-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.terminal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
}

.result-line {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  opacity: 0.7;
  font-size: 0.8rem;
}

.result-line .prompt { color: #10b981; font-weight: bold; }
.result-line .cmd { color: #e2e8f0; }
.result-line .time { color: #64748b; margin-left: auto; }

.code-block {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: #e2e8f0;
  line-height: 1.6;
}

.result-content.error .code-block {
  color: #fca5a5;
}

.terminal-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #475569;
  opacity: 0.5;
}

.placeholder-visual {
  font-size: 3rem;
  margin-bottom: 12px;
  opacity: 0.5;
}

/* 底部操作区 */
.panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  border-top: 1px solid var(--border);
  background: #fff;
  flex-shrink: 0; /* 关键：防止被压缩 */
  z-index: 20; /* 确保在最上层 */
}

.server-info-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #f8fafc;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  font-size: 0.85rem;
  color: #475569;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-indicator.online { background: #10b981; }

.footer-actions {
  display: flex;
  gap: 16px;
  align-items: center;
}

.action-group {
  display: flex;
  gap: 12px;
}

/* 按钮组件 */
.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
}

.btn-primary:hover:not(:disabled) {
  box-shadow: 0 8px 12px -1px rgba(37, 99, 235, 0.3);
  transform: translateY(-1px);
}

.btn-glow:not(:disabled) {
  position: relative;
  overflow: hidden;
}

.btn-glow:after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%);
  transform: skewX(-20deg) translateX(-150%);
  transition: transform 0.5s;
}

.btn-glow:hover:after {
  transform: skewX(-20deg) translateX(150%);
  transition: transform 0.5s;
}

.btn-text {
  background: transparent;
  color: #64748b;
}
.btn-text:hover { color: #334155; background: #f1f5f9; }

.btn-success-soft {
  background: #ecfdf5;
  color: #059669;
}
.btn-success-soft:hover { background: #d1fae5; }

.btn-danger-soft {
  background: #fef2f2;
  color: #dc2626;
}
.btn-danger-soft:hover { background: #fee2e2; }

.btn-block { width: 100%; padding: 12px; font-size: 1rem; }
.btn-lg { padding: 12px 32px; font-size: 1rem; }

.btn-icon-sm {
  width: 28px; height: 28px;
  border-radius: 6px;
  background: rgba(255,255,255,0.1);
  color: #cbd5e1;
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.btn-icon-sm:hover { background: rgba(255,255,255,0.2); color: #fff; }

/* 动画 */
.spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-large {
  width: 48px; height: 48px;
  border: 4px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

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
  max-width: 300px;
}

.empty-illustration {
  font-size: 4rem;
  margin-bottom: 24px;
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(-10px); }
}

.empty-content h3 {
  color: #334155;
  font-size: 1.25rem;
  margin-bottom: 8px;
}
.empty-content p { color: #64748b; }
</style>