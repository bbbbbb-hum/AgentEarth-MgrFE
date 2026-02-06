<template>
  <div class="mcp-test-panel" :class="{ 'focus-mode': focusMode }">
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

    <div class="main-content">
      <!-- 左侧 Sidebar：只包含连接配置 -->
      <div class="sidebar">
        <div class="card connection-card">
          <div class="card-title-row">
            <span class="card-title">连接</span>
            <span class="pill" :class="connectionStatus">{{ statusText }}</span>
          </div>
          <div class="kv">
            <span class="k">configId</span>
            <span class="v">{{ configId }}</span>
          </div>
          <div class="kv" v-if="connectResult?.server_info">
            <span class="k">Server</span>
            <span class="v">{{ connectResult.server_info.name }} v{{ connectResult.server_info.version }}</span>
          </div>
          <div class="err" v-if="connectionError">{{ connectionError }}</div>
          <div class="btn-row">
            <button class="btn btn-primary" :disabled="connecting" @click="connect">
              {{ connecting ? '连接中...' : (connectionStatus === 'connected' ? '重连' : '连接') }}
            </button>
            <button class="btn btn-light" :disabled="connecting && connectionStatus !== 'connected'" @click="disconnect">
              断开
            </button>
          </div>
        </div>
      </div>

      <!-- 右侧工作区 -->
      <div class="work-area" ref="workAreaEl" :style="{ '--drawerHeight': (bottomCollapsed ? 44 : drawerHeight) + 'px' }">
        <!-- 上部分：两列网格布局 -->
        <div class="tools-grid">
          <!-- 左列：工具列表 -->
          <div class="tools-list-panel">
            <div class="panel-header">
              <span class="panel-title">工具</span>
              <span class="panel-count">{{ filteredTools.length }}</span>
            </div>
            <div class="panel-search">
              <input v-model="toolQuery" class="search-input" type="text" placeholder="搜索工具..." />
            </div>
            <div class="panel-body custom-scrollbar">
              <div v-if="filteredTools.length === 0" class="empty-state">
                {{ connectionStatus === 'connected' ? '暂无可用工具' : '请先连接服务' }}
              </div>
              <template v-else>
                <div
                  v-for="tool in filteredTools"
                  :key="tool.name"
                  class="tool-item"
                  role="button"
                  tabindex="0"
                  :class="{ active: selectedTool?.name === tool.name }"
                  @click.prevent.stop="selectTool(tool)"
                  @keydown.enter.prevent.stop="selectTool(tool)"
                  @keydown.space.prevent.stop="selectTool(tool)"
                >
                  <div class="tool-icon-wrapper">
                    <span class="tool-icon">🛠️</span>
                  </div>
                  <div class="tool-info">
                    <div class="tool-name">{{ tool.name }}</div>
                    <div class="tool-summary" v-if="tool.description">{{ tool.description }}</div>
                  </div>
                  <span class="tool-arrow">›</span>
                </div>
              </template>
            </div>
          </div>

          <!-- 右列：工具详情 -->
          <div class="tool-detail-panel">
            <template v-if="selectedTool">
              <div class="panel-header">
                <div class="tool-header-info">
                  <span class="tool-icon">🛠️</span>
                  <span class="tool-title">{{ selectedTool.name }}</span>
                </div>
                <div class="tool-header-actions">
                  <button class="btn btn-light btn-sm" type="button" @click="copyInput">复制输入</button>
                  <button class="btn btn-light btn-sm" type="button" @click="clearInput">清空</button>
                </div>
              </div>
              <div class="panel-body custom-scrollbar">
                <!-- 工具描述 -->
                <p v-if="selectedTool.description" class="tool-description">{{ selectedTool.description }}</p>
                
                <!-- 参数表单 -->
                <div class="params-section">
                  <div class="section-title">参数</div>
                  <div class="schema-hint">{{ schemaHint }}</div>
                  <SchemaForm :schema="selectedTool.inputSchema" v-model="toolArguments" />
                </div>
                
                <!-- 运行按钮 -->
                <div class="run-section">
                  <button class="btn btn-primary btn-run" type="button" @click="executeTool" :disabled="calling || connectionStatus !== 'connected'">
                    <span v-if="calling" class="btn-spinner"></span>
                    {{ calling ? '运行中...' : '运行工具' }}
                  </button>
                </div>
                
                <!-- 结果区域 -->
                <div class="result-section" v-if="callResult || calling">
                  <div class="result-header">
                    <div class="result-left">
                      <span class="section-title">结果</span>
                      <span v-if="callResult" class="pill" :class="callResult.success && !callResult.is_error ? 'success' : 'error'">
                        {{ callResult.success && !callResult.is_error ? '成功' : '失败' }}
                      </span>
                      <span v-if="callResult?.duration_ms" class="pill time">{{ callResult.duration_ms }}ms</span>
                    </div>
                    <div class="result-right">
                      <button class="btn btn-light btn-sm" type="button" @click="resultView = 'structured'" :class="{ active: resultView === 'structured' }">结构化</button>
                      <button class="btn btn-light btn-sm" type="button" @click="resultView = 'raw'" :class="{ active: resultView === 'raw' }">原始</button>
                      <button class="btn btn-light btn-sm" type="button" @click="copyResult" :disabled="!callResult">复制</button>
                      <button class="btn btn-light btn-sm" type="button" @click="clearResult" :disabled="!callResult">清空</button>
                    </div>
                  </div>
                  <div class="result-body">
                    <div v-if="calling" class="calling-overlay">
                      <div class="calling-content">
                        <div class="calling-spinner-large"></div>
                        <div class="calling-info">
                          <div class="calling-title">正在调用 {{ selectedTool?.name }}</div>
                          <div class="calling-timer">
                            已等待 <span class="time-value">{{ elapsedSeconds }}</span>s / {{ timeoutSeconds }}s
                          </div>
                          <div class="calling-progress">
                            <div class="progress-bar">
                              <div 
                                class="progress-fill" 
                                :style="{ width: progressPercent + '%' }"
                                :class="{ 'progress-warning': progressPercent > 70, 'progress-danger': progressPercent > 90 }"
                              ></div>
                            </div>
                          </div>
                          <button class="btn btn-light btn-sm btn-cancel" @click="cancelCall">
                            取消调用
                          </button>
                        </div>
                      </div>
                    </div>
                    <template v-else-if="callResult">
                      <!-- 结构化视图 -->
                      <template v-if="resultView === 'structured'">
                        <template v-if="callResult.success && !callResult.is_error">
                          <ContentRenderer :content="callResult.content" />
                        </template>
                        <div v-else class="error-result">
                          <div class="error-header">
                            <span class="error-icon">⚠️</span>
                            <span class="error-title">{{ callResult.success ? '工具执行错误' : '调用失败' }}</span>
                          </div>
                          <div class="error-message">{{ callResult.error || '未知错误' }}</div>
                          <ContentRenderer v-if="callResult.content" :content="callResult.content" />
                        </div>
                      </template>
                      <!-- 原始JSON视图 -->
                      <pre v-else class="code">{{ formatJson(callResult) }}</pre>
                    </template>
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="empty-state">
              <div class="empty-icon">🔧</div>
              <div class="empty-title">选择一个工具</div>
              <div class="empty-sub">从左侧列表中选择一个工具来查看详情并运行</div>
            </div>
          </div>
        </div>

        <!-- 下部分：历史/通知抽屉 -->
        <div class="work-splitter" @pointerdown="startResize">
          <div class="work-splitter-grip"></div>
        </div>

        <div class="bottom-drawer" :class="{ collapsed: bottomCollapsed }">
          <div class="drawer-header">
            <div class="tabs">
              <button type="button" class="tab" :class="{ active: bottomTab === 'history' }" @click="bottomTab = 'history'">历史</button>
              <button type="button" class="tab" :class="{ active: bottomTab === 'events' }" @click="bottomTab = 'events'">通知</button>
            </div>
            <div class="drawer-actions">
              <button v-if="bottomTab === 'history'" type="button" class="btn btn-light btn-sm" @click="clearHistory" :disabled="history.length === 0">清空</button>
              <button v-else type="button" class="btn btn-light btn-sm" @click="clearEvents" :disabled="events.length === 0">清空</button>
              <button type="button" class="btn btn-light btn-sm" @click="bottomCollapsed = !bottomCollapsed">
                {{ bottomCollapsed ? '展开' : '收起' }}
              </button>
            </div>
          </div>
          <div v-if="!bottomCollapsed" class="drawer-body">
            <McpHistoryPanel v-if="bottomTab === 'history'" :entries="history" @select="applyHistory" />
            <McpNotificationsPanel v-else :entries="events" />
          </div>
        </div>
      </div>
    </div>

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
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import SchemaForm from './SchemaForm.vue';
import ContentRenderer from './ContentRenderer.vue';
import McpHistoryPanel, { type HistoryEntry } from './McpHistoryPanel.vue';
import McpNotificationsPanel, { type NotifyEntry, type NotifyLevel } from './McpNotificationsPanel.vue';
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
const resultView = ref<'structured' | 'raw'>('structured');
const focusMode = ref(false);
const toolQuery = ref('');

const bottomTab = ref<'history' | 'events'>('history');
const bottomCollapsed = ref(true);
const drawerHeight = ref(280);
const workAreaEl = ref<HTMLDivElement | null>(null);
const history = ref<HistoryEntry[]>([]);
const events = ref<NotifyEntry[]>([]);
const historySeq = ref(0);

// 历史记录持久化相关常量
const HISTORY_STORAGE_KEY = `mcp-history-${props.configId}`;
const HISTORY_MAX_ITEMS = 50; // 最大保存条数

// 超时进度相关状态
const timeoutSeconds = ref(30); // 默认超时时间（秒）
const elapsedSeconds = ref(0);
const callStartTime = ref<number | null>(null);
const progressTimer = ref<ReturnType<typeof setInterval> | null>(null);
const resizing = ref(false);
const resizeStartY = ref(0);
const resizeStartHeight = ref(0);
const activePointerId = ref<number | null>(null);
try {
  const stored = Number(localStorage.getItem('mcpTestPanel.drawerHeight'));
  if (Number.isFinite(stored) && stored >= 120 && stored <= 520) {
    drawerHeight.value = stored;
  }
} catch {
  // ignore
}

// 加载持久化的历史记录
const loadPersistedHistory = () => {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        history.value = parsed;
        // 恢复 historySeq
        if (parsed.length > 0) {
          historySeq.value = Math.max(...parsed.map((h: HistoryEntry) => h.seq || 0));
        }
      }
    }
  } catch (e) {
    console.warn('加载历史记录失败:', e);
  }
};

// 保存历史记录到 localStorage
const saveHistoryToStorage = () => {
  try {
    // 只保存最近的 HISTORY_MAX_ITEMS 条记录
    const toSave = history.value.slice(0, HISTORY_MAX_ITEMS);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('保存历史记录失败:', e);
  }
};

// 初始化时加载历史记录
loadPersistedHistory();

// 监听历史记录变化，自动保存
watch(history, () => {
  saveHistoryToStorage();
}, { deep: true });

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

const filteredTools = computed(() => {
  const q = toolQuery.value.trim().toLowerCase();
  if (!q) return tools.value;
  return tools.value.filter(t => {
    const n = (t.name || '').toLowerCase();
    const d = (t.description || '').toLowerCase();
    return n.includes(q) || d.includes(q);
  });
});

const schemaHint = computed(() => {
  const schema = selectedTool.value?.inputSchema as any;
  if (!schema) return 'Schema：无';
  const props = schema?.properties;
  const count = props && typeof props === 'object' ? Object.keys(props).length : 0;
  if (!props) return 'Schema：无参数';
  return `Schema：${count} 个字段`;
});

const clampDrawerHeight = (value: number) => {
  const minDrawer = 160;
  const minRunner = 260;
  const splitter = 12;
  const container = workAreaEl.value?.clientHeight ?? window.innerHeight;
  const maxDrawer = Math.max(minDrawer, container - splitter - minRunner);
  return Math.max(minDrawer, Math.min(maxDrawer, value));
};

const onPointerMove = (e: PointerEvent) => {
  if (!resizing.value) return;
  if (activePointerId.value !== null && e.pointerId !== activePointerId.value) return;
  const dy = resizeStartY.value - e.clientY;
  const next = resizeStartHeight.value + dy;
  drawerHeight.value = clampDrawerHeight(next);
};

const stopResize = () => {
  if (!resizing.value) return;
  resizing.value = false;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', stopResize);
  window.removeEventListener('pointercancel', stopResize);
  activePointerId.value = null;
  try {
    localStorage.setItem('mcpTestPanel.drawerHeight', String(drawerHeight.value));
  } catch {
    // ignore
  }
};

const startResize = (e: PointerEvent) => {
  e.preventDefault();
  if (bottomCollapsed.value) bottomCollapsed.value = false;
  resizing.value = true;
  resizeStartY.value = e.clientY;
  resizeStartHeight.value = drawerHeight.value;
  activePointerId.value = e.pointerId;
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointercancel', stopResize);
};

onBeforeUnmount(() => {
  stopResize();
  stopProgressTimer();
});

const addEvent = (level: NotifyLevel, message: string, payload?: any) => {
  const ts = Date.now();
  events.value.unshift({
    id: `${ts}-${Math.random().toString(16).slice(2)}`,
    ts,
    level,
    message,
    payload
  });
};

const addHistory = (method: string, request: any, response: any, status: 'success' | 'error', duration_ms?: number, title?: string) => {
  const ts = Date.now();
  historySeq.value += 1;
  history.value.unshift({
    id: `${ts}-${Math.random().toString(16).slice(2)}`,
    seq: historySeq.value,
    ts,
    method,
    title,
    status,
    duration_ms,
    request,
    response
  });
};

// 连接服务
const connect = async () => {
  connecting.value = true;
  connectionError.value = null;
  
  try {
    const response = await testConnect(props.configId);
    
    if (response.code === 0 && response.data.success) {
      connectResult.value = response.data;
      tools.value = response.data.tools || [];
      addEvent('info', '连接成功', { server_info: response.data.server_info, tools_count: tools.value.length });
      addHistory('initialize', { method: 'initialize', params: {} }, { server_info: response.data.server_info, wemcp_name: response.data.wemcp_name }, 'success', response.data.duration_ms);
      addHistory('tools/list', { method: 'tools/list', params: {} }, { tools: tools.value }, 'success');
    } else {
      connectionError.value = response.data.error || response.message || '连接失败';
      addEvent('error', '连接失败', { error: connectionError.value });
      addHistory('initialize', { method: 'initialize', params: {} }, { error: connectionError.value }, 'error');
    }
  } catch (err: any) {
    connectionError.value = err.message || '网络错误';
    addEvent('error', '网络错误', { error: connectionError.value });
    addHistory('initialize', { method: 'initialize', params: {} }, { error: connectionError.value }, 'error');
  } finally {
    connecting.value = false;
  }
};

const disconnect = () => {
  connectResult.value = null;
  tools.value = [];
  selectedTool.value = null;
  toolArguments.value = {};
  callResult.value = null;
  connectionError.value = null;
  addEvent('info', '已断开连接');
};

// 选择工具
const selectTool = (tool: McpTool) => {
  selectedTool.value = tool;
  toolArguments.value = {};
  callResult.value = null;
  resultView.value = 'structured';
  addEvent('info', `选择工具：${tool.name}`);
};

// 启动进度计时器
const startProgressTimer = () => {
  callStartTime.value = Date.now();
  elapsedSeconds.value = 0;
  progressTimer.value = setInterval(() => {
    if (callStartTime.value) {
      elapsedSeconds.value = Math.floor((Date.now() - callStartTime.value) / 1000);
    }
  }, 100);
};

// 停止进度计时器
const stopProgressTimer = () => {
  if (progressTimer.value) {
    clearInterval(progressTimer.value);
    progressTimer.value = null;
  }
  callStartTime.value = null;
};

// 计算进度百分比
const progressPercent = computed(() => {
  if (!calling.value || timeoutSeconds.value <= 0) return 0;
  return Math.min(100, (elapsedSeconds.value / timeoutSeconds.value) * 100);
});

// 取消调用（目前仅关闭进度指示，实际请求无法取消）
const cancelCall = () => {
  stopProgressTimer();
  calling.value = false;
  callResult.value = {
    success: false,
    error: '用户取消了调用'
  };
  if (selectedTool.value) {
    addEvent('warn', `用户取消调用：${selectedTool.value.name}`);
  }
};

// 执行工具
const executeTool = async () => {
  if (!selectedTool.value) return;
  
  calling.value = true;
  callResult.value = null;
  startProgressTimer();
  
  try {
    const response = await testCall(
      props.configId,
      selectedTool.value.name,
      toolArguments.value
    );
    
    callResult.value = response.data;
    addEvent(
      callResult.value.success && !callResult.value.is_error ? 'info' : 'warn',
      `调用工具：${selectedTool.value.name}`,
      { success: callResult.value.success, is_error: callResult.value.is_error, duration_ms: callResult.value.duration_ms }
    );
    addHistory(
      'tools/call',
      { method: 'tools/call', params: { name: selectedTool.value.name, arguments: toolArguments.value } },
      callResult.value,
      callResult.value.success && !callResult.value.is_error ? 'success' : 'error',
      callResult.value.duration_ms,
      selectedTool.value.name
    );
  } catch (err: any) {
    callResult.value = {
      success: false,
      error: err.message || '调用失败'
    };
    addEvent('error', `调用失败：${selectedTool.value.name}`, { error: callResult.value.error });
    addHistory(
      'tools/call',
      { method: 'tools/call', params: { name: selectedTool.value.name, arguments: toolArguments.value } },
      callResult.value,
      'error',
      undefined,
      selectedTool.value.name
    );
  } finally {
    stopProgressTimer();
    calling.value = false;
  }
};

const toggleFocus = () => {
  focusMode.value = !focusMode.value;
  if (focusMode.value) {
    bottomCollapsed.value = true;
  }
};

const formatJson = (value: any): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const copyResult = async () => {
  if (!callResult.value) return;
  try {
    await navigator.clipboard.writeText(formatJson(callResult.value));
  } catch {
    // ignore
  }
};

const clearResult = () => {
  callResult.value = null;
};

const copyInput = async () => {
  try {
    await navigator.clipboard.writeText(formatJson(toolArguments.value));
  } catch {
    // ignore
  }
};

const clearInput = () => {
  toolArguments.value = {};
};

const clearHistory = () => {
  history.value = [];
  historySeq.value = 0;
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const clearEvents = () => {
  events.value = [];
};

const applyHistory = (entry: HistoryEntry) => {
  if (entry.method !== 'tools/call') return;
  const name = entry.request?.params?.name;
  const args = entry.request?.params?.arguments;
  const tool = tools.value.find(t => t.name === name) || null;
  if (tool) selectedTool.value = tool;
  toolArguments.value = args && typeof args === 'object' ? args : {};
  callResult.value = entry.response as CallResponse;
  bottomCollapsed.value = true;
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
  height: 100%;
  width: 100%;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.02);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--text-main);
}

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

.main-content {
  display: flex;
  /* 使用 flex: 1 1 0 确保正确分配空间 */
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  background: #f8fafc;
}

.mcp-test-panel.focus-mode .sidebar {
  display: none;
}

.sidebar {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
  align-self: stretch;
}

.connection-card {
  flex-shrink: 0;
}

.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  /* 连接卡片不收缩 */
  flex-shrink: 0;
}



.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.card-title {
  font-weight: 800;
  color: #0f172a;
}

.count {
  font-size: 0.8rem;
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
}

.kv {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 0.9rem;
}

.k {
  color: #94a3b8;
}

.v {
  color: #334155;
  word-break: break-all;
}

.err {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 0.9rem;
  line-height: 1.4;
}

.btn-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.search {
  margin-bottom: 10px;
}

.search-input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.95rem;
  outline: none;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
}

.tools-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-item {
  width: 100%;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 10px;
  text-align: left;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.tool-item:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.tool-item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tool-item.active {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.tool-icon-wrapper {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-item.active .tool-icon-wrapper {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.tool-name {
  font-weight: 800;
  color: #0f172a;
  font-size: 0.95rem;
  line-height: 1.3;
  word-break: break-all;
}

.tool-summary {
  margin-top: 2px;
  color: #64748b;
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.work-area {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 12px;
  overflow: hidden;
  background: #f8fafc;
}

/* 两列网格布局 */
.tools-grid {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(400px, 2fr);
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

/* 工具列表面板 */
.tools-list-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* 工具详情面板 */
.tool-detail-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* 面板头部 */
.panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  background: #fafbfc;
}

.panel-title {
  font-weight: 700;
  color: #1e293b;
  font-size: 0.95rem;
}

.panel-count {
  background: #e2e8f0;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

/* 面板搜索框 */
.panel-search {
  padding: 8px 12px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

/* 面板内容区域 */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 0;
}

/* 工具详情面板的 panel-body 需要更多 padding */
.tool-detail-panel .panel-body {
  padding: 16px;
}

/* 工具头部信息 */
.tool-header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-header-info .tool-icon {
  font-size: 1.2rem;
}

.tool-header-info .tool-title {
  font-weight: 700;
  color: #1e293b;
  font-size: 1rem;
}

.tool-header-actions {
  display: flex;
  gap: 8px;
}

/* 工具描述 */
.tool-description {
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
}

/* 参数区域 */
.params-section {
  margin-bottom: 16px;
}

/* 运行区域 */
.run-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
}

.btn-run {
  width: 100%;
  padding: 12px 24px;
  font-size: 1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #fff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* 结果区域 */
.result-section {
  background: #0f172a;
  border-radius: 12px;
  overflow: hidden;
}

.result-section .result-header {
  padding: 10px 12px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.result-section .result-body {
  padding: 12px;
  color: #e2e8f0;
  max-height: 400px;
  overflow-y: auto;
}

/* 空状态样式 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 8px;
}

.empty-sub {
  font-size: 0.9rem;
  color: #94a3b8;
  line-height: 1.5;
}

/* 工具项样式 */
.tool-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid transparent;
}

.tool-item:hover {
  background: #f1f5f9;
}

.tool-item.active {
  background: #eff6ff;
  border-color: #3b82f6;
}

.tool-arrow {
  color: #94a3b8;
  font-size: 1.2rem;
  font-weight: 300;
  margin-left: auto;
  flex-shrink: 0;
}

.tool-item.active .tool-arrow {
  color: #3b82f6;
}

.schema-hint {
  margin: -4px 0 12px;
  color: #94a3b8;
  font-size: 0.82rem;
}

.section-title {
  font-weight: 800;
  color: #334155;
  font-size: 0.9rem;
  margin-bottom: 10px;
}


.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #0f172a;
  border-bottom: 1px solid #1f2a44;
}

.result-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.result-right {
  display: flex;
  gap: 8px;
}

.result-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.placeholder {
  color: rgba(226, 232, 240, 0.55);
  font-size: 0.9rem;
  padding: 10px 0;
}

.calling-placeholder {
  display: flex;
  align-items: center;
  gap: 10px;
}

.calling-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(226, 232, 240, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* 错误结果样式 */
.error-result {
  padding: 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.error-icon {
  font-size: 1.2rem;
}

.error-title {
  font-weight: 700;
  color: #fca5a5;
  font-size: 0.95rem;
}

.error-message {
  color: #fecaca;
  font-size: 0.9rem;
  line-height: 1.5;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 调用进度指示器样式 */
.calling-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.calling-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
}

.calling-spinner-large {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.calling-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.calling-title {
  font-size: 1rem;
  font-weight: 600;
  color: #e2e8f0;
}

.calling-timer {
  font-size: 0.9rem;
  color: #94a3b8;
}

.time-value {
  font-weight: 700;
  color: #3b82f6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.calling-progress {
  width: 200px;
}

.progress-bar {
  height: 6px;
  background: rgba(100, 116, 139, 0.3);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 3px;
  transition: width 0.1s linear, background 0.3s ease;
}

.progress-fill.progress-warning {
  background: #f59e0b;
}

.progress-fill.progress-danger {
  background: #ef4444;
  animation: pulse-danger 0.5s ease-in-out infinite alternate;
}

@keyframes pulse-danger {
  from { opacity: 0.8; }
  to { opacity: 1; }
}

.btn-cancel {
  margin-top: 8px;
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.btn-cancel:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

.code {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.85rem;
  line-height: 1.55;
}

.old-empty-sub {
  font-size: 0.9rem;
}

.work-splitter {
  height: 12px;
  flex-shrink: 0;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  touch-action: none;
  background: transparent;
}

.work-splitter:hover {
  background: rgba(59, 130, 246, 0.06);
}

.work-splitter-grip {
  width: 56px;
  height: 4px;
  border-radius: 999px;
  background: #cbd5e1;
  box-shadow: 0 -6px 0 #cbd5e1, 0 6px 0 #cbd5e1;
  opacity: 0.85;
}

.work-splitter:hover .work-splitter-grip {
  background: #93c5fd;
  box-shadow: 0 -6px 0 #93c5fd, 0 6px 0 #93c5fd;
}

.bottom-drawer {
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: #fff;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  /* 使用 CSS 变量控制高度 */
  height: var(--drawerHeight);
}

.bottom-drawer.collapsed {
  height: 44px;
}

.drawer-header {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: #f8fafc;
}

.tabs {
  display: flex;
  gap: 6px;
}

.tab {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 6px 10px;
  font-weight: 800;
  font-size: 0.85rem;
  cursor: pointer;
  color: #334155;
}

.tab.active {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.drawer-actions {
  display: flex;
  gap: 8px;
}

.drawer-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 800;
  border: 1px solid #e2e8f0;
  background: #f1f5f9;
  color: #334155;
}

.pill.connected {
  background: #dcfce7;
  border-color: #bbf7d0;
  color: #15803d;
}

.pill.connecting {
  background: #fef3c7;
  border-color: #fde68a;
  color: #b45309;
}

.pill.error {
  background: #fee2e2;
  border-color: #fecaca;
  color: #b91c1c;
}

.pill.success {
  background: rgba(16, 185, 129, 0.16);
  border-color: rgba(16, 185, 129, 0.25);
  color: #34d399;
}

.pill.time {
  background: rgba(59, 130, 246, 0.14);
  border-color: rgba(59, 130, 246, 0.22);
  color: #93c5fd;
}

/* 按钮 */
.btn {
  padding: 10px 14px;
  border: none;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  user-select: none;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn-light {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #334155;
}

.btn-light:hover:not(:disabled) {
  background: #e2e8f0;
}

.btn-sm {
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 800;
}

.btn-sm.active {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.btn-text {
  background: transparent;
  color: #64748b;
  border: 1px solid transparent;
}
.btn-text:hover {
  background: #f1f5f9;
  color: #334155;
}

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

/* 底部操作区 */
.panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: #fff;
  flex-shrink: 0;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.server-info-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #f8fafc;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  font-size: 0.85rem;
  color: #475569;
}

.server-name {
  font-weight: 600;
}

.server-version {
  color: #94a3b8;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-indicator.online { background: #10b981; }

.footer-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.action-group {
  display: flex;
  gap: 10px;
}
</style>
