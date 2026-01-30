<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';

interface Chain {
  Id: number;
  Name: string;
  Status: string;
  NodeIds: number[];
  CreateTime: string;
  UpdateTime: string;
}

interface Config {
  Id: number;
  Name: string;
  Type: string;
  LaunchInfo: string;
  CreateTime: string;
  UpdateTime: string;
  ConnectInfo: string;
  ExternalServiceId: string;
  MaxInstance: number;
  CreateStatus: boolean;
  Description: string;
  ProjectName: string;
  ServerId: string;
}

interface Node {
  Id: number;
  NodeName: string;
  NodeHandle: string;
  Enabled: boolean;
  CreateTime: string;
  UpdateTime: string;
  ExternalServiceId: string;
  Description: string;
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
    config: Config;
    node_list: Node[];
    service: Service;
  };
}

const route = useRoute();
const serviceId = ref(Number(route.params.id));
const apiBaseUrl = import.meta.env.BASE_URL;

const detailData = ref<ApiResponse['data'] | null>(null);
const loading = ref(true);
const error = ref('');

const authorizedFetch = async (url: string, init?: RequestInit) => {
  const token = localStorage.getItem('token');
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if ((init?.method && init.method !== 'GET') || init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });
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
            <h3 class="panel-title">配置信息</h3>
            <div v-if="detailData.config" class="config-info">
              <div class="detail-grid">
                <div class="detail-item">
                  <label>配置ID:</label>
                  <span>{{ detailData.config.Id }}</span>
                </div>
                <div class="detail-item">
                  <label>配置名称:</label>
                  <span>{{ detailData.config.Name }}</span>
                </div>
                <div class="detail-item">
                  <label>服务类型:</label>
                  <span>{{ detailData.config.Type }}</span>
                </div>
                <div class="detail-item">
                  <label>外部服务ID:</label>
                  <span>{{ detailData.config.ExternalServiceId }}</span>
                </div>
                <div class="detail-item">
                  <label>最大实例数:</label>
                  <span>{{ detailData.config.MaxInstance }}</span>
                </div>
                <div class="detail-item">
                  <label>创建状态:</label>
                  <span :class="`status-badge status-${detailData.config.CreateStatus ? 'running' : 'stopped'}`">
                    {{ detailData.config.CreateStatus ? '已创建' : '未创建' }}
                  </span>
                </div>
                <div class="detail-item">
                  <label>创建时间:</label>
                  <span>{{ new Date(detailData.config.CreateTime).toLocaleString() }}</span>
                </div>
                <div class="detail-item">
                  <label>更新时间:</label>
                  <span>{{ new Date(detailData.config.UpdateTime).toLocaleString() }}</span>
                </div>
                <div class="detail-item full-width">
                  <label>项目名称:</label>
                  <span>{{ detailData.config.ProjectName }}</span>
                </div>
                <div class="detail-item full-width">
                  <label>配置描述:</label>
                  <span>{{ detailData.config.Description || '' }}</span>
                </div>
                <div class="detail-item full-width">
                  <label>启动信息:</label>
                  <div class="code-block">
                    {{ detailData.config.LaunchInfo || '' }}
                  </div>
                </div>
                <div class="detail-item full-width">
                  <label>链接信息:</label>
                  <div class="code-block">
                    {{ detailData.config.ConnectInfo || '' }}
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="empty-section">
              <p>暂无配置信息</p>
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
                      <th>外部服务ID</th>
                      <th>创建时间</th>
                      <th>更新时间</th>
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
                      <td>{{ node.ExternalServiceId }}</td>
                      <td>{{ new Date(node.CreateTime).toLocaleString() }}</td>
                      <td>{{ new Date(node.UpdateTime).toLocaleString() }}</td>
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
</style>

