<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { apiBaseUrl, authorizedFetch } from '../http';

interface Chain {
  Id: number;
  Name: string;
  Status: string;
  NodeIds: number[];
  CreateTime: string;
  UpdateTime: string;
}

interface Node {
  Id: number;
  NodeName: string;
  NodeHandle: string;
  Enabled: boolean;
  CreateTime: string;
  UpdateTime: string;
  Description: string;
  ServerId: string;
  NodeConfig?: string;
}

interface Service {
  Id: number;
  ServerId: string;
  ServerName: string;
  Logo: string;
  ProtocolVersion: string;
  Enabled: boolean;
  Tags: string[];
  Description: string;
  TaskChainId: number;
  CreateTime: string;
  UpdateTime: string;
  XNetServiceId: {
    String: string;
    Valid: boolean;
  };
  CallNum: number;
  CallSuccessNum: number;
  ResponseTime: number;
  IsCreated: boolean;
  ProjectName: string;
  IsInstall: boolean;
  XlcreditPrice: number;
}

interface ApiResponse {
  code: number;
  message: string;
  data: {
    chain: Chain;
    node_list: Node[];
    service: Service;
  };
}

const route = useRoute();
const serviceId = ref(Number(route.params.id));

const detailData = ref<ApiResponse['data'] | null>(null);
const loading = ref(true);
const error = ref('');

const nodeConfigVisible = ref(false);
const nodeConfigLoading = ref(false);
const nodeConfigSaving = ref(false);
const nodeConfigError = ref('');
const nodeConfigServerId = ref('');
const nodeConfigValue = ref('');

const formatNodeConfig = (raw?: string) => {
  const trimmed = (raw || '').trim();
  if (!trimmed || trimmed === 'null') return '{}';
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
};

const fetchServiceDetail = async () => {
  loading.value = true;
  error.value = '';
  try {
    const resp = await authorizedFetch(`${apiBaseUrl}api/admin/mcp/service/detail/${serviceId.value}`);
    if (!resp.ok) {
      if (resp.status === 401) {
        error.value = '登录已过期，请重新登录';
        return;
      }
      const text = await resp.text();
      error.value = text || '获取服务详情失败';
      return;
    }
    const result: ApiResponse = await resp.json();
    if (result.code === 0) {
      detailData.value = result.data;
      if (detailData.value?.service?.ServerName) {
        window.dispatchEvent(
          new CustomEvent('update-tab-service-name', {
            detail: {
              path: route.path,
              serviceName: detailData.value.service.ServerName
            }
          })
        );
      }
    } else {
      error.value = `获取服务详情失败: ${result.message}`;
    }
  } catch (err) {
    error.value = '获取服务详情失败，请检查网络连接或稍后重试';
  } finally {
    loading.value = false;
  }
};

const openNodeConfig = async (serverId: string, cachedNodeConfig?: string) => {
  nodeConfigServerId.value = serverId;
  nodeConfigVisible.value = true;
  nodeConfigLoading.value = true;
  nodeConfigSaving.value = false;
  nodeConfigError.value = '';
  if (cachedNodeConfig && cachedNodeConfig.trim()) {
    try {
      nodeConfigValue.value = JSON.stringify(JSON.parse(cachedNodeConfig), null, 2);
    } catch {
      nodeConfigValue.value = cachedNodeConfig;
    }
  } else {
    nodeConfigValue.value = '';
  }

  try {
    const resp = await authorizedFetch(
      `${apiBaseUrl}api/admin/data/task-node/node-config?server_id=${encodeURIComponent(serverId)}`
    );
    const result = await resp.json();
    if (result.code !== 0) {
      nodeConfigError.value = result.message || '获取 node_config 失败';
      return;
    }
    const raw = result?.data?.node_config ?? '{}';
    try {
      nodeConfigValue.value = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      nodeConfigValue.value = String(raw);
    }
  } catch (e: any) {
    nodeConfigError.value = e?.message || '获取 node_config 失败';
  } finally {
    nodeConfigLoading.value = false;
  }
};

const closeNodeConfig = () => {
  nodeConfigVisible.value = false;
  nodeConfigLoading.value = false;
  nodeConfigSaving.value = false;
  nodeConfigError.value = '';
  nodeConfigServerId.value = '';
  nodeConfigValue.value = '';
};

const saveNodeConfig = async () => {
  nodeConfigError.value = '';
  const serverId = nodeConfigServerId.value;
  if (!serverId) return;

  try {
    JSON.parse(nodeConfigValue.value || '{}');
  } catch (e: any) {
    nodeConfigError.value = e?.message ? `JSON 解析失败: ${e.message}` : 'JSON 解析失败';
    return;
  }

  nodeConfigSaving.value = true;
  try {
    const resp = await authorizedFetch(`${apiBaseUrl}api/admin/data/task-node/node-config`, {
      method: 'POST',
      body: JSON.stringify({
        server_id: serverId,
        node_config: nodeConfigValue.value || '{}',
      }),
    });
    const result = await resp.json();
    if (result.code !== 0) {
      nodeConfigError.value = result.message || '保存 node_config 失败';
      return;
    }
    closeNodeConfig();
  } catch (e: any) {
    nodeConfigError.value = e?.message || '保存 node_config 失败';
  } finally {
    nodeConfigSaving.value = false;
  }
};

const goBack = () => {
  window.history.back();
};

onMounted(() => {
  fetchServiceDetail();
});

watch(
  () => route.params.id,
  (id) => {
    serviceId.value = Number(id);
    fetchServiceDetail();
  }
);
</script>

<template>
  <div class="mcp-service-detail">
    <section class="detail-section">
      <div class="detail-card">
        <div v-if="loading" class="loading-state">
          <p>加载中...</p>
        </div>
        
        <div v-else-if="error" class="error-state">
          <p>{{ error }}</p>
          <button class="retry-btn" @click="fetchServiceDetail">重试</button>
        </div>
        
        <div v-else-if="detailData" class="detail-content">
          <section class="detail-panel">
            <h3 class="panel-title">服务基本信息</h3>
            <div v-if="detailData.service" class="service-info">
              <div class="detail-header">
                <h4>{{ detailData.service.ServerName }}</h4>
                <span :class="`status-badge status-${detailData.service.Enabled ? 'running' : 'stopped'}`">
                  {{ detailData.service.Enabled ? '启用' : '禁用' }}
                </span>
              </div>
              
              <div class="detail-grid">
                <div class="detail-item">
                  <label>服务ID:</label>
                  <span>{{ detailData.service.ServerId }}</span>
                </div>
                <div class="detail-item">
                  <label>协议版本:</label>
                  <span>{{ detailData.service.ProtocolVersion }}</span>
                </div>
                <div class="detail-item">
                  <label>调用次数:</label>
                  <span>{{ detailData.service.CallNum }}</span>
                </div>
                <div class="detail-item">
                  <label>成功调用次数:</label>
                  <span>{{ detailData.service.CallSuccessNum }}</span>
                </div>
                <div class="detail-item">
                  <label>平均响应时间:</label>
                  <span>{{ detailData.service.ResponseTime }}ms</span>
                </div>
                <div class="detail-item">
                  <label>单价:</label>
                  <span>{{ detailData.service.XlcreditPrice }}</span>
                </div>
                <div class="detail-item">
                  <label>是否创建:</label>
                  <span :class="`status-badge status-${detailData.service.IsCreated ? 'running' : 'stopped'}`">
                    {{ detailData.service.IsCreated ? '是' : '否' }}
                  </span>
                </div>
                <div class="detail-item">
                  <label>是否安装:</label>
                  <span :class="`status-badge status-${detailData.service.IsInstall ? 'running' : 'stopped'}`">
                    {{ detailData.service.IsInstall ? '是' : '否' }}
                  </span>
                </div>
                <div class="detail-item">
                  <label>创建时间:</label>
                  <span>{{ new Date(detailData.service.CreateTime).toLocaleString() }}</span>
                </div>
                <div class="detail-item">
                  <label>更新时间:</label>
                  <span>{{ new Date(detailData.service.UpdateTime).toLocaleString() }}</span>
                </div>
              </div>
              
              <div class="detail-section">
                <h4>服务描述</h4>
                <div class="description-box">
                  {{ detailData.service.Description || '' }}
                </div>
              </div>
              
              <div class="detail-section">
                <h4>标签</h4>
                <div class="tags-box">
                  <span class="tag" v-for="(tag, index) in detailData.service.Tags" :key="index">
                    {{ tag }}
                  </span>
                  <span v-if="!detailData.service.Tags || detailData.service.Tags.length === 0" class="no-tags"></span>
                </div>
              </div>
            </div>
            <div v-else class="empty-section">
              <p>暂无服务基本信息</p>
            </div>
          </section>
          
          <section class="detail-panel">
            <h3 class="panel-title">任务链信息</h3>
            <div v-if="detailData.chain" class="chain-info">
              <div class="detail-grid">
                <div class="detail-item">
                  <label>链ID:</label>
                  <span>{{ detailData.chain.Id }}</span>
                </div>
                <div class="detail-item">
                  <label>链名称:</label>
                  <span>{{ detailData.chain.Name }}</span>
                </div>
                <div class="detail-item">
                  <label>链状态:</label>
                  <span>{{ detailData.chain.Status }}</span>
                </div>
                <div class="detail-item">
                  <label>节点数量:</label>
                  <span>{{ detailData.chain.NodeIds?.length || '' }}</span>
                </div>
                <div class="detail-item">
                  <label>创建时间:</label>
                  <span>{{ new Date(detailData.chain.CreateTime).toLocaleString() }}</span>
                </div>
                <div class="detail-item">
                  <label>更新时间:</label>
                  <span>{{ new Date(detailData.chain.UpdateTime).toLocaleString() }}</span>
                </div>
                <div class="detail-item full-width">
                  <label>节点ID列表:</label>
                  <span>{{ detailData.chain.NodeIds?.join(', ') || '' }}</span>
                </div>
              </div>
            </div>
            <div v-else class="empty-section">
              <p>暂无任务链信息</p>
            </div>
          </section>
          
          <section class="detail-panel">
            <h3 class="panel-title">节点列表</h3>
            <div v-if="detailData.node_list" class="node-list">
              <div class="table-container">
                <table class="node-table">
                  <thead>
                    <tr>
                      <th>节点ID</th>
                      <th>节点名称</th>
                      <th>节点句柄</th>
                      <th>状态</th>
                      <th>服务ID</th>
                      <th>节点配置</th>
                      <th>创建时间</th>
                      <th>更新时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="node in detailData.node_list" :key="node.Id">
                      <td>{{ node.Id }}</td>
                      <td>
                        <div class="node-name-container">
                          <span class="node-name">{{ node.NodeName }}</span>
                          <span v-if="node.Description" class="node-desc">{{ node.Description }}</span>
                        </div>
                      </td>
                      <td>{{ node.NodeHandle }}</td>
                      <td>
                        <span :class="`status-badge status-${node.Enabled ? 'running' : 'stopped'}`">
                          {{ node.Enabled ? '启用' : '禁用' }}
                        </span>
                      </td>
                      <td>{{ node.ServerId || '-' }}</td>
                      <td><div class="node-config-cell">{{ formatNodeConfig(node.NodeConfig) }}</div></td>
                      <td>{{ new Date(node.CreateTime).toLocaleString() }}</td>
                      <td>{{ new Date(node.UpdateTime).toLocaleString() }}</td>
                      <td>
                        <button class="retry-btn" :disabled="!node.ServerId" @click="openNodeConfig(node.ServerId, node.NodeConfig)">
                          编辑配置
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="detailData.node_list.length === 0" class="empty-table">
                  <p>暂无节点数据</p>
                </div>
              </div>
            </div>
            <div v-else class="empty-section">
              <p>暂无节点列表数据</p>
            </div>
          </section>
        </div>
        
        <div v-else class="empty-state">
          <p>暂无服务详情数据</p>
        </div>
      </div>
    </section>
    <div v-if="nodeConfigVisible" class="modal-overlay" @click="closeNodeConfig">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h4>节点配置 (server_id: {{ nodeConfigServerId }})</h4>
          <button class="modal-close" @click="closeNodeConfig">×</button>
        </div>
        <div class="modal-body">
          <div v-if="nodeConfigLoading" class="loading-state">
            <p>加载中...</p>
          </div>
          <div v-else>
            <textarea v-model="nodeConfigValue" class="modal-textarea" rows="14"></textarea>
            <div v-if="nodeConfigError" class="error-state">
              <p>{{ nodeConfigError }}</p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="retry-btn" @click="closeNodeConfig">取消</button>
          <button class="retry-btn" :disabled="nodeConfigSaving || nodeConfigLoading" @click="saveNodeConfig">
            {{ nodeConfigSaving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mcp-service-detail {
  padding: 10px;
  background-color: #f5f7fa;
  min-height: 100vh;
  overflow-y: auto !important;
}
.detail-section {
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  overflow: hidden;
}
.detail-card { padding: 20px; }
.loading-state, .error-state, .empty-state { text-align: center; padding: 60px; color: #909399; }
.error-state { color: #f56c6c; }
.retry-btn {
  margin-top: 10px;
  padding: 6px 12px;
  background-color: #409eff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
}
.retry-btn:hover { background-color: #66b1ff; }
.detail-header {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #ebeef5;
}
.detail-header h4 {
  margin: 0;
  margin-right: 15px;
  font-size: 16px;
  color: #303133;
  font-weight: 600;
}
.detail-header .status-badge { margin-top: 0; margin-left: 10px; }
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 15px 30px;
  margin-bottom: 25px;
}
.detail-content { display: flex; flex-direction: column; gap: 25px; }
.detail-panel {
  background-color: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}
.panel-title {
  margin: 0 0 20px 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}
.detail-item { display: flex; align-items: center; }
.detail-item label {
  width: 120px;
  font-weight: 500;
  color: #606266;
  margin-right: 10px;
  white-space: nowrap;
}
.detail-item span { color: #303133; word-break: break-all; flex: 1; }
.detail-item.full-width { grid-column: 1 / -1; }
.detail-section { margin-bottom: 20px; padding: 0 0 15px 0; border-bottom: 1px solid #ebeef5; }
.detail-section:last-child { border-bottom: none; }
.detail-section h4 { margin: 0 0 15px 0; font-size: 14px; font-weight: 600; color: #303133; }
.description-box {
  padding: 15px;
  background-color: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  color: #303133;
  line-height: 1.5;
  min-height: 80px;
}
.tags-box {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 5px;
}
.tags-box::-webkit-scrollbar { height: 4px; }
.tags-box::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 2px; }
.tags-box::-webkit-scrollbar-thumb { background: #c0c4cc; border-radius: 2px; }
.tags-box::-webkit-scrollbar-thumb:hover { background: #909399; }
.tag {
  display: inline-block;
  padding: 4px 10px;
  background-color: #ecf5ff;
  color: #409eff;
  border-radius: 10px;
  font-size: 12px;
  border: 1px solid #d9ecff;
  white-space: nowrap;
  flex-shrink: 0;
}
.no-tags { color: #909399; font-size: 12px; }
.table-container { overflow-x: auto; margin-top: 15px; }
.node-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.node-table th, .node-table td { padding: 8px 12px; text-align: left; border: 1px solid #ebeef5; }
.node-table th {
  background-color: #f5f7fa;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
}
.node-table td { color: #303133; }
.node-config-cell {
  max-height: 120px;
  overflow: auto;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.4;
  background-color: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 6px 8px;
}
.node-table tbody tr:hover { background-color: #f5f7fa; }
.node-name-container { display: flex; flex-direction: column; gap: 4px; }
.node-name { font-weight: 500; color: #303133; }
.node-desc { font-size: 11px; color: #909399; line-height: 1.3; }
.empty-table { text-align: center; padding: 40px 20px; color: #909399; font-size: 14px; }
.code-block {
  margin-top: 5px;
  padding: 15px;
  background-color: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  color: #303133;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.empty-section {
  text-align: center;
  padding: 30px 20px;
  color: #909399;
  font-size: 14px;
  background-color: #fafafa;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  margin: 10px 0;
}
.status-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}
.status-badge.status-running { background-color: #f0f9eb; color: #67c23a; }
.status-badge.status-stopped { background-color: #fef0f0; color: #f56c6c; }
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: min(900px, 92vw);
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
}
.modal-header h4 {
  margin: 0;
  font-size: 14px;
  color: #303133;
}
.modal-close {
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: #909399;
}
.modal-body { padding: 12px 16px; }
.modal-textarea {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.5;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 10px;
  resize: vertical;
  box-sizing: border-box;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #ebeef5;
}
</style>

