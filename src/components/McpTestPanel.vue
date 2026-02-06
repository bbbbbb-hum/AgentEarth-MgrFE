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
/* ============================================
   MCP Test Panel - Inspector Style
   模仿 MCP Inspector 的现代化设计
   ============================================ */

/* CSS 变量 - 主题配色系统 */
.mcp-test-panel {
  /* 基础颜色 */
  --background: hsl(0 0% 100%);
  --foreground: hsl(222.2 84% 4.9%);
  --card: hsl(0 0% 100%);
  --card-foreground: hsl(222.2 84% 4.9%);
  
  /* 主色调 */
  --primary: hsl(221.2 83.2% 53.3%);
  --primary-foreground: hsl(210 40% 98%);
  --primary-hover: hsl(221.2 83.2% 46%);
  
  /* 次要颜色 */
  --secondary: hsl(210 40% 96.1%);
  --secondary-foreground: hsl(222.2 47.4% 11.2%);
  
  /* 静音颜色 */
  --muted: hsl(210 40% 96.1%);
  --muted-foreground: hsl(215.4 16.3% 46.9%);
  
  /* 强调色 */
  --accent: hsl(210 40% 96.1%);
  --accent-foreground: hsl(222.2 47.4% 11.2%);
  
  /* 状态颜色 */
  --success: hsl(142 76% 36%);
  --success-bg: hsl(142 76% 94%);
  --destructive: hsl(0 84.2% 60.2%);
  --destructive-bg: hsl(0 84.2% 95%);
  --warning: hsl(38 92% 50%);
  --warning-bg: hsl(38 92% 95%);
  
  /* 边框和输入 */
  --border: hsl(214.3 31.8% 91.4%);
  --input: hsl(214.3 31.8% 91.4%);
  --ring: hsl(221.2 83.2% 53.3%);
  
  /* 圆角 */
  --radius: 0.5rem;
  --radius-lg: 0.75rem;
  
  /* 阴影 */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  
  /* 整体布局 */
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--background);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-md), 0 0 0 1px var(--border);
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--foreground);
  font-size: 14px;
  line-height: 1.5;
}

/* ============================================
   滚动条样式
   ============================================ */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.3);
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.5);
}

/* ============================================
   顶部标题栏
   ============================================ */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-wrapper {
  width: 36px;
  height: 36px;
  background: var(--secondary);
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
}

.header-info h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--foreground);
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.service-name {
  font-size: 0.8rem;
  color: var(--muted-foreground);
  font-weight: 500;
}

.connection-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 500;
  background: var(--muted);
  color: var(--muted-foreground);
}

.connection-badge.connected { 
  background: var(--success-bg); 
  color: var(--success); 
}
.connection-badge.connecting { 
  background: var(--warning-bg); 
  color: var(--warning); 
}
.connection-badge.error { 
  background: var(--destructive-bg); 
  color: var(--destructive); 
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}

.btn-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-close:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

/* ============================================
   主内容区域
   ============================================ */
.main-content {
  display: flex;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  background: var(--background);
}

.mcp-test-panel.focus-mode .sidebar {
  display: none;
}

/* ============================================
   左侧 Sidebar
   ============================================ */
.sidebar {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--card);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  /* 确保 sidebar 铺满父容器高度 */
  height: 100%;
  min-height: 0;
}

.connection-card {
  flex-shrink: 0;
}

.card {
  background: var(--card);
  padding: 16px;
  flex-shrink: 0;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.card-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--foreground);
}

.count {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  background: var(--muted);
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 500;
}

.kv {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 0.85rem;
}

.k {
  color: var(--muted-foreground);
  flex-shrink: 0;
}

.v {
  color: var(--foreground);
  word-break: break-all;
  text-align: right;
}

.err {
  margin: 8px 0;
  padding: 8px 12px;
  border-radius: var(--radius);
  border: 1px solid hsl(var(--destructive) / 0.2);
  background: var(--destructive-bg);
  color: var(--destructive);
  font-size: 0.85rem;
  line-height: 1.4;
}

.btn-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn-row .btn {
  flex: 1;
}

/* ============================================
   搜索输入框
   ============================================ */
.search {
  margin-bottom: 8px;
}

.search-input {
  width: 100%;
  border: 1px solid var(--input);
  border-radius: var(--radius);
  padding: 8px 12px;
  font-size: 0.875rem;
  outline: none;
  background: var(--background);
  color: var(--foreground);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.search-input::placeholder {
  color: var(--muted-foreground);
}

.search-input:focus {
  border-color: var(--ring);
  box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
}

.tools-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ============================================
   工具列表项
   ============================================ */
.tool-item {
  width: 100%;
  border: none;
  background: transparent;
  border-radius: var(--radius);
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  transition: background 0.15s ease;
}

.tool-item:hover {
  background: var(--accent);
}

.tool-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tool-item.active {
  background: var(--primary);
  color: var(--primary-foreground);
}

.tool-icon-wrapper {
  width: 28px;
  height: 28px;
  border-radius: var(--radius);
  background: var(--secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 0.9rem;
}

.tool-item.active .tool-icon-wrapper {
  background: hsl(0 0% 100% / 0.2);
}

.tool-info {
  flex: 1;
  min-width: 0;
}

.tool-name {
  font-weight: 500;
  font-size: 0.875rem;
  line-height: 1.3;
  word-break: break-all;
}

.tool-item.active .tool-name {
  color: var(--primary-foreground);
}

.tool-summary {
  margin-top: 2px;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-item.active .tool-summary {
  color: hsl(0 0% 100% / 0.8);
}

.tool-arrow {
  color: var(--muted-foreground);
  font-size: 1.2rem;
  flex-shrink: 0;
}

.tool-item.active .tool-arrow {
  color: var(--primary-foreground);
}

/* ============================================
   右侧工作区
   ============================================ */
.work-area {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
  overflow: hidden;
  background: var(--muted);
}

/* 两列网格布局 */
.tools-grid {
  flex: 1 1 0;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

/* ============================================
   工具列表面板 (仿 ListPane)
   ============================================ */
.tools-list-panel {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* ============================================
   工具详情面板
   ============================================ */
.tool-detail-panel {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* 面板通用头部 */
.tools-list-panel > .panel-header,
.tool-detail-panel > .panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  background: var(--card);
}

.panel-title {
  font-weight: 600;
  color: var(--foreground);
  font-size: 0.9rem;
}

.panel-count {
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 0.75rem;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 9999px;
}

/* 面板搜索框 */
.panel-search {
  padding: 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.panel-search .search-input {
  width: 100%;
}

/* 面板内容区域 */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  min-height: 0;
}

/* 工具详情面板的 panel-body 需要更多 padding */
.tool-detail-panel > .panel-body {
  padding: 20px;
}

/* 工具头部信息 */
.tool-header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-header-info .tool-icon {
  font-size: 1.1rem;
}

.tool-header-info .tool-title {
  font-weight: 600;
  color: var(--foreground);
  font-size: 0.95rem;
}

.tool-header-actions {
  display: flex;
  gap: 6px;
}

/* 工具描述 */
.tool-description {
  color: var(--muted-foreground);
  font-size: 0.875rem;
  line-height: 1.6;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

/* 参数区域 */
.params-section {
  margin-bottom: 20px;
}

.section-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--foreground);
  margin-bottom: 8px;
}

.schema-hint {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  margin-bottom: 12px;
}

/* 运行区域 */
.run-section {
  margin-bottom: 20px;
}

.btn-run {
  width: 100%;
  padding: 10px 20px;
  font-size: 0.875rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ============================================
   结果区域
   ============================================ */
.result-section {
  background: hsl(222.2 84% 4.9%);
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid hsl(217.2 32.6% 17.5%);
}

.result-section .result-header {
  padding: 12px 16px;
  background: hsl(217.2 32.6% 12%);
  border-bottom: 1px solid hsl(217.2 32.6% 17.5%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.result-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-right {
  display: flex;
  gap: 6px;
}

.result-section .result-body {
  padding: 16px;
  color: hsl(210 40% 96.1%);
  max-height: 400px;
  overflow-y: auto;
}

/* ============================================
   空状态样式
   ============================================ */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground);
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 16px;
  opacity: 0.4;
}

.empty-title {
  font-size: 1rem;
  font-weight: 500;
  color: var(--foreground);
  margin-bottom: 8px;
}

.empty-sub {
  font-size: 0.875rem;
  color: var(--muted-foreground);
  line-height: 1.5;
  max-width: 240px;
}

/* ============================================
   错误结果样式
   ============================================ */
.error-result {
  padding: 16px;
  background: hsl(var(--destructive) / 0.1);
  border: 1px solid hsl(var(--destructive) / 0.2);
  border-radius: var(--radius);
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.error-icon {
  font-size: 1.1rem;
}

.error-title {
  font-weight: 600;
  color: hsl(0 84% 80%);
  font-size: 0.9rem;
}

.error-message {
  color: hsl(0 84% 90%);
  font-size: 0.85rem;
  line-height: 1.5;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: var(--radius);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ============================================
   调用进度指示器样式
   ============================================ */
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
  gap: 16px;
  text-align: center;
}

.calling-spinner-large {
  width: 40px;
  height: 40px;
  border: 3px solid hsl(var(--primary) / 0.2);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.calling-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.calling-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: hsl(210 40% 96.1%);
}

.calling-timer {
  font-size: 0.8rem;
  color: var(--muted-foreground);
}

.time-value {
  font-weight: 600;
  color: var(--primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.calling-progress {
  width: 180px;
}

.progress-bar {
  height: 4px;
  background: hsl(var(--muted-foreground) / 0.2);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  transition: width 0.1s linear, background 0.3s ease;
}

.progress-fill.progress-warning {
  background: var(--warning);
}

.progress-fill.progress-danger {
  background: var(--destructive);
  animation: pulse-danger 0.5s ease-in-out infinite alternate;
}

@keyframes pulse-danger {
  from { opacity: 0.8; }
  to { opacity: 1; }
}

.btn-cancel {
  margin-top: 8px;
}

.code {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.8rem;
  line-height: 1.6;
}

/* ============================================
   底部抽屉分割线
   ============================================ */
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
  transition: background 0.15s;
  position: relative;
  z-index: 10;
  /* 增加可点击区域 */
  margin: -4px 0;
  padding: 4px 0;
}

.work-splitter:hover,
.work-splitter:active {
  background: hsl(221.2 83.2% 53.3% / 0.1);
}

.work-splitter-grip {
  width: 48px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  transition: background 0.15s;
  pointer-events: none;
}

.work-splitter:hover .work-splitter-grip,
.work-splitter:active .work-splitter-grip {
  background: var(--primary);
}

/* ============================================
   底部抽屉
   ============================================ */
.bottom-drawer {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--card);
  box-shadow: var(--shadow);
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: var(--drawerHeight, 280px);
  min-height: 120px;
  transition: height 0.15s ease;
}

.bottom-drawer.collapsed {
  height: 44px;
  min-height: 44px;
}

.drawer-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--card);
  flex-shrink: 0;
}

.tabs {
  display: flex;
  gap: 4px;
}

.tab {
  border: none;
  background: transparent;
  border-radius: var(--radius);
  padding: 6px 12px;
  font-weight: 500;
  font-size: 0.8rem;
  cursor: pointer;
  color: var(--muted-foreground);
  transition: all 0.15s;
}

.tab:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.tab.active {
  background: var(--secondary);
  color: var(--foreground);
}

.drawer-actions {
  display: flex;
  gap: 6px;
}

.drawer-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ============================================
   Pills / Badges
   ============================================ */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 500;
  background: var(--muted);
  color: var(--muted-foreground);
}

.pill.connected {
  background: var(--success-bg);
  color: var(--success);
}

.pill.connecting {
  background: var(--warning-bg);
  color: var(--warning);
}

.pill.error {
  background: var(--destructive-bg);
  color: var(--destructive);
}

.pill.success {
  background: hsl(var(--success) / 0.15);
  color: hsl(142 76% 50%);
}

.pill.time {
  background: hsl(var(--primary) / 0.15);
  color: var(--primary);
}

/* ============================================
   按钮样式 (shadcn/ui 风格)
   ============================================ */
.btn {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  user-select: none;
  box-shadow: var(--shadow-sm);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Primary Button */
.btn-primary {
  background: var(--primary);
  color: var(--primary-foreground);
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

/* Secondary / Light Button */
.btn-light {
  background: var(--secondary);
  color: var(--secondary-foreground);
  box-shadow: none;
}

.btn-light:hover:not(:disabled) {
  background: hsl(var(--accent) / 0.8);
}

/* Ghost Button */
.btn-ghost {
  background: transparent;
  color: var(--foreground);
  box-shadow: none;
}

.btn-ghost:hover:not(:disabled) {
  background: var(--accent);
}

/* Outline Button */
.btn-outline {
  background: transparent;
  border: 1px solid var(--input);
  color: var(--foreground);
  box-shadow: none;
}

.btn-outline:hover:not(:disabled) {
  background: var(--accent);
}

/* Small Button */
.btn-sm {
  padding: 6px 10px;
  font-size: 0.75rem;
}

.btn-sm.active {
  background: var(--primary);
  color: var(--primary-foreground);
}

/* Text Button */
.btn-text {
  background: transparent;
  color: var(--muted-foreground);
  box-shadow: none;
}

.btn-text:hover:not(:disabled) {
  color: var(--foreground);
  background: var(--accent);
}

/* Success Soft Button */
.btn-success-soft {
  background: var(--success-bg);
  color: var(--success);
  box-shadow: none;
}

.btn-success-soft:hover:not(:disabled) {
  background: hsl(var(--success) / 0.2);
}

/* Danger Soft Button */
.btn-danger-soft {
  background: var(--destructive-bg);
  color: var(--destructive);
  box-shadow: none;
}

.btn-danger-soft:hover:not(:disabled) {
  background: hsl(var(--destructive) / 0.2);
}

/* ============================================
   底部 Footer
   ============================================ */
.panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--card);
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
  gap: 6px;
  padding: 4px 10px;
  background: var(--muted);
  border-radius: 9999px;
  font-size: 0.8rem;
  color: var(--muted-foreground);
}

.server-name {
  font-weight: 500;
  color: var(--foreground);
}

.server-version {
  color: var(--muted-foreground);
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-indicator.online { 
  background: var(--success); 
}

.footer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-group {
  display: flex;
  gap: 8px;
}

/* ============================================
   输入框样式
   ============================================ */
input[type="text"],
input[type="number"],
input[type="password"],
input[type="email"],
textarea,
select {
  border: 1px solid var(--input);
  border-radius: var(--radius);
  padding: 8px 12px;
  font-size: 0.875rem;
  outline: none;
  background: var(--background);
  color: var(--foreground);
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
}

input::placeholder,
textarea::placeholder {
  color: var(--muted-foreground);
}

input:focus,
textarea:focus,
select:focus {
  border-color: var(--ring);
  box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
}

/* ============================================
   响应式调整
   ============================================ */
@media (max-width: 900px) {
  .tools-grid {
    grid-template-columns: 1fr;
  }
  
  .sidebar {
    width: 240px;
  }
}
</style>
