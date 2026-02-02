<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const apiBaseUrl = import.meta.env.BASE_URL;

const goToDetail = (id: number) => {
  router.push(`/mcp-services/${id}`);
};

interface McpService {
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
  CreatedGroup?: string;
  XlcreditPrice: number;
}

const mcpServices = ref<McpService[]>([]);
const totalServices = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const loading = ref(false);
const selectedIds = ref<number[]>([]);

const enabledFilter = ref(0);
const isCreatedFilter = ref(0);
const isInstallFilter = ref(0);
const searchKeyword = ref('');
const serverId = ref('');

const allSelected = computed({
  get: () => mcpServices.value.length > 0 && selectedIds.value.length === mcpServices.value.length,
  set: (value: boolean) => {
    if (value) {
      selectedIds.value = mcpServices.value.map(service => service.Id);
    } else {
      selectedIds.value = [];
    }
  }
});

const hasTaskChainId = computed(() => {
  if (selectedIds.value.length === 0) return false;
  return mcpServices.value.some(service => selectedIds.value.includes(service.Id) && service.TaskChainId);
});

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

const fetchMcpServices = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.append('page', currentPage.value.toString());
    params.append('size', pageSize.value.toString());
    if (searchKeyword.value.trim()) {
      params.append('search', searchKeyword.value.trim());
    }
    if (serverId.value.trim()) {
      params.append('server_id', serverId.value.trim());
    }
    if (enabledFilter.value !== 0) {
      params.append('enabled', enabledFilter.value.toString());
    }
    if (isCreatedFilter.value !== 0) {
      params.append('is_created', isCreatedFilter.value.toString());
    }
    if (isInstallFilter.value !== 0) {
      params.append('is_install', isInstallFilter.value.toString());
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const resp = await authorizedFetch(`${apiBaseUrl}api/admin/mcp/service/list?${params.toString()}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      if (resp.status === 401) {
        console.error('未授权或登录过期');
        return;
      }
      const text = await resp.text();
      console.error('获取MCP服务列表失败:', text);
      return;
    }
    const result = await resp.json();
    if (result.code === 0) {
      mcpServices.value = result.data.list || [];
      totalServices.value = result.data.total || 0;
    } else {
      console.error('获取MCP服务列表失败:', result.message);
    }
  } catch (error) {
    console.error('获取MCP服务列表失败:', error);
  } finally {
    loading.value = false;
  }
};

const nextPage = () => {
  const totalPages = Math.ceil(totalServices.value / pageSize.value);
  if (currentPage.value < totalPages) {
    currentPage.value++;
    fetchMcpServices();
  }
};

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
    fetchMcpServices();
  }
};

const batchDelete = async () => {
  if (selectedIds.value.length === 0) {
    alert('请先选择要删除的服务');
    return;
  }
  if (!confirm('确定要批量删除选中的服务吗？此操作不可恢复！')) return;
  try {
    const resp = await authorizedFetch(`${apiBaseUrl}api/admin/mcp/service/delete`, {
      method: 'DELETE',
      body: JSON.stringify({ ids: selectedIds.value })
    });
    if (!resp.ok) {
      const text = await resp.text();
      alert(`批量删除失败: ${text}`);
      return;
    }
    const result = await resp.json();
    if (result.code === 0) {
      alert('批量删除成功');
      selectedIds.value = [];
      fetchMcpServices();
    } else {
      alert(`批量删除失败: ${result.message}`);
    }
  } catch (error) {
    console.error('批量删除请求失败:', error);
    alert('批量删除请求失败，请检查网络连接或稍后重试');
  }
};

const showUpdateGroupModal = ref(false);
const updateGroupValue = ref(0);
const openUpdateGroupModal = () => {
  showUpdateGroupModal.value = true;
};

const updateBatchCreatedGroup = async () => {
  if (selectedIds.value.length === 0) {
    alert('请先选择要更新的服务');
    return;
  }
  if (!confirm(`确定要将选中的${selectedIds.value.length}个服务的启动组更新为${updateGroupValue.value}吗？`)) return;
  try {
    const resp = await authorizedFetch(`${apiBaseUrl}api/admin/mcp/service/update/created-group`, {
      method: 'POST',
      body: JSON.stringify({
        ids: selectedIds.value,
        created_group: updateGroupValue.value
      })
    });
    if (!resp.ok) {
      const text = await resp.text();
      alert(`批量更新启动组失败: ${text}`);
      return;
    }
    const result = await resp.json();
    if (result.code === 0) {
      alert('批量更新启动组成功');
      showUpdateGroupModal.value = false;
      selectedIds.value = [];
      fetchMcpServices();
    } else {
      alert(`批量更新启动组失败: ${result.message}`);
    }
  } catch (error) {
    console.error('批量更新启动组请求失败:', error);
    alert('批量更新启动组请求失败，请检查网络连接或稍后重试');
  }
};

const batchClose = async () => {
  if (selectedIds.value.length === 0) {
    alert('请先选择要关闭的服务');
    return;
  }
  if (!confirm('确定要批量关闭选中的服务吗？')) return;
  try {
    const resp = await authorizedFetch(`${apiBaseUrl}api/admin/mcp/service/batch-close`, {
      method: 'POST',
      body: JSON.stringify({ ids: selectedIds.value })
    });
    if (!resp.ok) {
      const text = await resp.text();
      alert(`批量关闭服务失败: ${text}`);
      return;
    }
    const result = await resp.json();
    if (result.code === 0) {
      alert('批量关闭服务成功');
      selectedIds.value = [];
      fetchMcpServices();
    } else {
      alert(`批量关闭服务失败: ${result.message}`);
    }
  } catch (error) {
    console.error('批量关闭服务请求失败:', error);
    alert('批量关闭服务请求失败，请检查网络连接或稍后重试');
  }
};

const generateChainNodes = async () => {
  if (selectedIds.value.length === 0) {
    alert('请先选择要生成链与节点的服务');
    return;
  }
  try {
    const batchBtn = document.querySelector('.batch-btn') as HTMLButtonElement | null;
    if (batchBtn) {
      batchBtn.textContent = '操作中...';
      batchBtn.disabled = true;
    }
    const resp = await authorizedFetch(`${apiBaseUrl}api/admin/mcp/service/task/create`, {
      method: 'POST',
      body: JSON.stringify({ ids: selectedIds.value })
    });
    const result = await resp.json();
    if (result.code === 0) {
      alert(`成功为 ${selectedIds.value.length} 条服务生成链与节点`);
      selectedIds.value = [];
      fetchMcpServices();
    } else {
      alert(`生成链与节点失败: ${result.message || '未知错误'}`);
    }
  } catch (error) {
    console.error('生成链与节点时发生错误:', error);
    alert('生成链与节点失败，请检查网络连接或稍后重试');
  } finally {
    const batchBtn = document.querySelector('.batch-btn') as HTMLButtonElement | null;
    if (batchBtn) {
      batchBtn.textContent = '批量生成链与节点';
      batchBtn.disabled = false;
    }
  }
};

const generateChainNode = async (id: number) => {
  try {
    const resp = await authorizedFetch(`${apiBaseUrl}api/admin/mcp/service/task/create`, {
      method: 'POST',
      body: JSON.stringify({ ids: [id] })
    });
    const result = await resp.json();
    if (result.code === 0) {
      alert('成功生成链与节点');
      fetchMcpServices();
    } else {
      alert(`生成链与节点失败: ${result.message || '未知错误'}`);
    }
  } catch (error) {
    console.error('生成链与节点时发生错误:', error);
    alert('生成链与节点失败，请检查网络连接或稍后重试');
  }
};

const toggleIsCreated = async (service: McpService) => {
  try {
    const resp = await authorizedFetch(`${apiBaseUrl}api/admin/mcp/service/update/is_create`, {
      method: 'POST',
      body: JSON.stringify({
        id: service.Id,
        is_created: !service.IsCreated
      })
    });
    if (!resp.ok) {
      const text = await resp.text();
      alert('修改是否创建状态失败: ' + text);
      return;
    }
    const result = await resp.json();
    if (result.code === 0) {
      service.IsCreated = !service.IsCreated;
    } else {
      alert(`修改是否创建状态失败: ${result.message || '未知错误'}`);
    }
  } catch (error) {
    console.error('修改是否创建状态时发生错误:', error);
    alert('修改是否创建状态失败，请检查网络连接或稍后重试');
  }
};

const resetFilters = () => {
  enabledFilter.value = 0;
  isCreatedFilter.value = 0;
  isInstallFilter.value = 0;
  searchKeyword.value = '';
  serverId.value = '';
  currentPage.value = 1;
  fetchMcpServices();
};

onMounted(() => {
  const savedFilter = sessionStorage.getItem('mcpServicesFilter');
  if (savedFilter) {
    const filter = JSON.parse(savedFilter);
    enabledFilter.value = filter.enabledFilter;
    isCreatedFilter.value = filter.isCreatedFilter;
    isInstallFilter.value = filter.isInstallFilter;
    searchKeyword.value = filter.searchKeyword;
    serverId.value = filter.serverId || '';
    currentPage.value = filter.currentPage;
    pageSize.value = filter.pageSize;
  }
  fetchMcpServices();
});

watch(
  [enabledFilter, isCreatedFilter, isInstallFilter, searchKeyword, serverId, currentPage, pageSize],
  () => {
    const filter = {
      enabledFilter: enabledFilter.value,
      isCreatedFilter: isCreatedFilter.value,
      isInstallFilter: isInstallFilter.value,
      searchKeyword: searchKeyword.value,
      serverId: serverId.value,
      currentPage: currentPage.value,
      pageSize: pageSize.value
    };
    sessionStorage.setItem('mcpServicesFilter', JSON.stringify(filter));
  },
  { deep: true }
);
</script>

<template>
  <div class="mcp-services-container">
    <section class="filter-section">
      <div class="filter-container">
        <div class="filter-item">
          <label>状态:</label>
          <select v-model="enabledFilter" class="filter-select" @change="fetchMcpServices">
            <option value="0">全部</option>
            <option value="1">是</option>
            <option value="-1">否</option>
          </select>
        </div>
        <div class="filter-item">
          <label>是否创建:</label>
          <select v-model="isCreatedFilter" class="filter-select" @change="fetchMcpServices">
            <option value="0">全部</option>
            <option value="1">是</option>
            <option value="-1">否</option>
          </select>
        </div>
        <div class="filter-item">
          <label>是否安装:</label>
          <select v-model="isInstallFilter" class="filter-select" @change="fetchMcpServices">
            <option value="0">全部</option>
            <option value="1">是</option>
            <option value="-1">否</option>
          </select>
        </div>
        <div class="filter-item search-item">
          <div class="search-box">
            <input 
              type="text" 
              v-model="searchKeyword" 
              placeholder="搜索服务..." 
              class="search-input"
              @keyup.enter="fetchMcpServices"
            >
            <button 
              v-if="searchKeyword" 
              class="clear-btn" 
              @click="searchKeyword = ''"
              title="清除搜索内容"
            >
              ×
            </button>
          </div>
          <button class="search-btn" @click="fetchMcpServices">搜索</button>
        </div>
        <div class="filter-item search-item">
          <div class="search-box">
            <input 
              type="text" 
              v-model="serverId" 
              placeholder="搜索Server ID" 
              class="search-input"
              @keyup.enter="fetchMcpServices"
            >
            <button 
              v-if="serverId" 
              class="clear-btn" 
              @click="serverId = ''"
              title="清除搜索内容"
            >
              ×
            </button>
          </div>
          <button class="search-btn" @click="fetchMcpServices">搜索</button>
        </div>
        <div class="filter-item">
          <button class="reset-btn" @click="resetFilters">重置</button>
        </div>
      </div>
    </section>
    
    <section class="table-section">
      <div class="table-card">
        <div v-if="loading" class="loading-state">
          <p>加载中...</p>
        </div>
        
        <div v-else-if="mcpServices.length > 0" class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th><input type="checkbox" v-model="allSelected"></th>
                <th>ID</th>
                <th>服务ID</th>
                <th>服务名称</th>
                <th>状态</th>
                <th>启动分组</th>
                <th>任务链ID</th>
                <th>是否创建</th>
                <th>是否安装</th>
                <th>标签</th>
                <th>响应时间</th>
                <th>单价</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="service in mcpServices" :key="service.Id" class="clickable-row">
                <td>
                  <input 
                    type="checkbox" 
                    v-model="selectedIds" 
                    :value="service.Id"
                    @click.stop
                  >
                </td>
                <td>{{ service.Id }}</td>
                <td>{{ service.ServerId }}</td>
                <td>
                  <span @click="goToDetail(service.Id)" class="service-name-link">
                    {{ service.ServerName }}
                  </span>
                </td>
                <td>
                  <span :class="`status-badge status-${service.Enabled ? 'running' : 'stopped'}`">
                    {{ service.Enabled ? '启用' : '禁用' }}
                  </span>
                </td>
                <td>{{ service.CreatedGroup || '-' }}</td>
                <td>{{ service.TaskChainId }}</td>
                <td class="switch-cell">
                  <div class="switch-container">
                    <label class="switch" @click.stop>
                      <input 
                        type="checkbox" 
                        :checked="service.IsCreated"
                        @change="toggleIsCreated(service)"
                      >
                      <span class="slider round"></span>
                    </label>
                  </div>
                </td>
                <td>
                  <span :class="`status-badge status-${service.IsInstall ? 'running' : 'stopped'}`">
                    {{ service.IsInstall ? '是' : '否' }}
                  </span>
                </td>
                <td>
                  <span class="tag" v-for="(tag, index) in service.Tags" :key="index">
                    {{ tag }}
                  </span>
                </td>
                <td>{{ service.ResponseTime }}ms</td>
                <td>{{ service.XlcreditPrice }}</td>
                <td>{{ new Date(service.CreateTime).toLocaleString() }}</td>
                <td>
                  <button 
                    class="action-btn generate-btn"
                    @click.stop="generateChainNode(service.Id)"
                    :disabled="!!service.TaskChainId"
                  >
                    生成链与节点
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div v-else class="empty-state">
          <p>暂无MCP服务数据</p>
        </div>
        
        <div v-if="!loading && mcpServices.length > 0" class="table-footer">
          <div class="batch-actions">
            <button
              class="batch-btn"
              @click="generateChainNodes"
              :disabled="hasTaskChainId"
              :title="hasTaskChainId ? '选中的服务中已有任务链ID，无法重复生成' : ''"
            >
              批量生成链与节点 ({{ selectedIds.length }})
            </button>
            <button
              class="batch-btn delete-btn"
              @click="batchDelete"
              :disabled="selectedIds.length === 0"
            >
              批量删除 ({{ selectedIds.length }})
            </button>
            <button
              class="batch-btn update-group-btn"
              @click="openUpdateGroupModal"
              :disabled="selectedIds.length === 0"
            >
              批量更新启动组 ({{ selectedIds.length }})
            </button>
            <button
              class="batch-btn close-btn"
              @click="batchClose"
              :disabled="selectedIds.length === 0"
            >
              批量关闭 ({{ selectedIds.length }})
            </button>
          </div>

          <div class="pagination">
            <button class="pagination-btn" @click="prevPage" :disabled="loading || currentPage === 1">上一页</button>
            <span class="pagination-info">
              {{ loading ? '加载中...' : `第 ${currentPage} 页 / 共 ${Math.ceil(totalServices / pageSize)} 页，共 ${totalServices} 条` }}
            </span>
            <button class="pagination-btn" @click="nextPage" :disabled="loading || currentPage === Math.ceil(totalServices / pageSize)">下一页</button>
            <select v-model="pageSize" class="page-size-select" @change="fetchMcpServices" :disabled="loading">
              <option value="10">10条/页</option>
              <option value="20">20条/页</option>
              <option value="50">50条/页</option>
              <option value="100">100条/页</option>
            </select>
          </div>
        </div>

        <div v-if="showUpdateGroupModal" class="modal-overlay" @click="showUpdateGroupModal = false">
          <div class="modal-content" @click.stop>
            <h3 class="modal-title">批量更新启动组</h3>
            <div class="modal-body">
              <label class="modal-label">启动组值:</label>
              <input 
                type="number" 
                v-model="updateGroupValue" 
                min="0" 
                class="modal-input"
                placeholder="请输入启动组值"
              >
              <p class="modal-note">当前已选择 {{ selectedIds.length }} 个服务</p>
            </div>
            <div class="modal-footer">
              <button class="modal-btn cancel-btn" @click="showUpdateGroupModal = false">取消</button>
              <button class="modal-btn confirm-btn" @click="updateBatchCreatedGroup">确定</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
  </template>

<style scoped>
.mcp-services-container {
  padding: 10px;
  background-color: #f5f7fa;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 100%;
}
.filter-section {
  margin-bottom: 12px;
  background-color: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}
.filter-container {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-item label {
  font-size: 14px;
  font-weight: 500;
  color: #606266;
  white-space: nowrap;
}
.filter-select {
  padding: 6px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background-color: #fff;
  font-size: 14px;
  color: #303133;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 96px;
}
.filter-select:hover { border-color: #c6e2ff; }
.filter-select:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}
.search-item { align-items: center; display: flex; gap: 0; }
.search-box {
  display: flex;
  align-items: center;
  background-color: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 6px 0 0 6px;
  padding: 0 6px;
  transition: all 0.3s ease;
  height: 36px;
}
.search-box:focus-within {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}
.search-input {
  padding: 6px 12px;
  border: none;
  outline: none;
  font-size: 13px;
  color: #303133;
  width: clamp(120px, 14vw, 160px);
  flex: 0 0 auto;
  height: 36px;
  background: transparent;
}
.search-input::placeholder { color: #909399; }
.search-btn {
  padding: 4px 8px;
  background-color: #409eff;
  color: white;
  border: none;
  border-radius: 0 6px 6px 0;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.3s ease;
  height: 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.2;
  text-align: center;
}
.search-btn:hover { background-color: #66b1ff; }
.clear-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: #909399;
  cursor: pointer;
  padding: 5px;
  margin-right: 5px;
  transition: all 0.3s ease;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.clear-btn:hover { background-color: #f56c6c; color: white; }
.reset-btn {
  padding: 8px 16px;
  background-color: #909399;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.3s ease;
  height: 36px;
}
.reset-btn:hover { background-color: #a6a9ad; }
.table-section {
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  overflow: hidden;
  flex: 1;
  min-height: 0;
}
.table-card {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.table-wrapper {
  overflow: auto !important;
  margin-bottom: 12px;
  flex: 1;
  min-height: 0;
}
.loading-state { text-align: center; padding: 40px; color: #909399; }
.data-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.data-table th, .data-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #ebeef5;
  white-space: nowrap;
}
.data-table td { font-size: 13px; }
.data-table th { font-size: 13px; }
.data-table th {
  background-color: #f5f7fa;
  font-weight: bold;
  color: #303133;
}
.service-name-link {
  cursor: pointer;
  color: #409eff;
  text-decoration: underline;
  transition: color 0.3s ease;
}
.service-name-link:hover { color: #66b1ff; }
.data-table tbody tr { cursor: default; transition: none; }
.data-table tbody tr:hover { background-color: transparent; }
.empty-state { text-align: center; padding: 60px; color: #909399; }
.status-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}
.status-badge.status-running { background-color: #f0f9eb; color: #67c23a; }
.status-badge.status-stopped { background-color: #fef0f0; color: #f56c6c; }
.tag {
  display: inline-block;
  padding: 2px 6px;
  margin-right: 4px;
  margin-bottom: 4px;
  background-color: #ecf5ff;
  color: #409eff;
  border-radius: 3px;
  font-size: 11px;
  border: 1px solid #d9ecff;
}
.switch-container { display: flex; justify-content: center; align-items: center; }
.switch { position: relative; display: inline-block; width: 40px; height: 20px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; }
.slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .4s; }
input:checked + .slider { background-color: #67c23a; }
input:focus + .slider { box-shadow: 0 0 1px #67c23a; }
input:checked + .slider:before { transform: translateX(20px); }
.slider.round { border-radius: 20px; }
.slider.round:before { border-radius: 50%; }
.table-footer {
  background-color: #fff;
  padding-top: 8px;
  border-top: 1px solid #ebeef5;
  flex-shrink: 0;
}

.batch-actions { display: flex; justify-content: flex-start; align-items: center; margin: 0; gap: 8px; flex-wrap: wrap; }
.batch-btn { padding: 6px 12px; background-color: #409eff; color: white; border: none; border-radius: 4px; cursor: pointer; transition: background-color 0.3s ease; margin-right: 6px; font-size: 12px; }
.batch-btn:hover { background-color: #66b1ff; }
.batch-btn:disabled { background-color: #c0c4cc; cursor: not-allowed; }
.batch-btn.delete-btn { background-color: #f56c6c; }
.batch-btn.delete-btn:hover:not(:disabled) { background-color: #f78989; }
.batch-btn.update-group-btn { background-color: #67c23a; }
.batch-btn.update-group-btn:hover:not(:disabled) { background-color: #85ce61; }
.batch-btn.close-btn { background-color: #6c757d; }
.batch-btn.close-btn:hover:not(:disabled) { background-color: #5a6268; }
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background-color: #fff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); width: 400px; max-width: 90%; }
.modal-title { margin: 0; padding: 16px 24px; font-size: 16px; font-weight: bold; border-bottom: 1px solid #ebeef5; }
.modal-body { padding: 24px; }
.modal-label { display: block; margin-bottom: 8px; font-weight: bold; }
.modal-input { width: 100%; padding: 8px 12px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 14px; margin-bottom: 16px; box-sizing: border-box; }
.modal-input:focus { outline: none; border-color: #409eff; }
.modal-note { color: #606266; font-size: 12px; margin-top: 0; }
.modal-footer { padding: 16px 24px; border-top: 1px solid #ebeef5; display: flex; justify-content: flex-end; gap: 12px; }
.modal-btn { padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; transition: background-color 0.3s; }
.cancel-btn { background-color: #fff; color: #606266; border: 1px solid #dcdfe6; }
.cancel-btn:hover { background-color: #f5f7fa; }
.confirm-btn { background-color: #409eff; color: #fff; }
.confirm-btn:hover { background-color: #66b1ff; }
.action-btn { padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.3s ease; margin-right: 4px; }
.generate-btn { background-color: #67c23a; color: white; }
.generate-btn:hover:not(:disabled) { background-color: #85ce61; }
.generate-btn:disabled { background-color: #c0c4cc; cursor: not-allowed; color: #fff; }
.pagination { display: flex; justify-content: center; align-items: center; margin-top: 8px; margin-bottom: 10px; gap: 10px; background-color: #f8f9fa; padding: 10px; border-radius: 4px; border: 1px solid #e9ecef; }
.pagination-btn { padding: 6px 12px; border: 1px solid #dcdfe6; background-color: #fff; border-radius: 4px; cursor: pointer; transition: all 0.3s ease; }
.pagination-btn:hover:not(:disabled) { border-color: #409eff; color: #409eff; }
.pagination-btn:disabled { color: #c0c4cc; cursor: not-allowed; }
.pagination-info { color: #606266; }
.page-size-select { padding: 6px; border: 1px solid #dcdfe6; border-radius: 4px; background-color: #fff; }
</style>
