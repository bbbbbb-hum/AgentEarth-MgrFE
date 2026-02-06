<template>
  <div class="service-list-container">
    <div class="page-header">
      <h1>外部MCP服务测试列表</h1>
    </div>
    
    <div class="service-test">
      <div class="service-panel">
        <div class="panel-header">
          <span class="panel-title">已录入服务</span>
          <div class="header-actions">
            <div class="search-box">
              <input 
                v-model="searchKeyword" 
                type="text" 
                placeholder="搜索服务名称..." 
                @keyup.enter="handleSearch"
              />
              <button class="btn btn-sm btn-search" @click="handleSearch">搜索</button>
            </div>
            <button class="btn btn-sm btn-refresh" @click="fetchServices">刷新</button>
          </div>
        </div>
        
        <div class="service-list" v-if="!loading">
          <div 
            v-for="service in serviceList" 
            :key="service.Id"
            class="service-item"
          >
            <div class="service-info">
              <span class="service-id">ID: {{ service.Id }}</span>
              <span class="service-name">{{ service.Name }}</span>
              <span class="service-wemcp">{{ service.WemcpName }}</span>
              <span class="status-badge" :class="getStatusClass(service.TestStatus)">
                {{ getStatusText(service.TestStatus) }}
              </span>
            </div>
            <div class="service-actions">
              <button 
                class="btn btn-sm btn-test"
                @click="openTestPanel(service)"
              >
                🧪 测试
              </button>
            </div>
          </div>
          <div v-if="serviceList.length === 0" class="empty-tip">暂无服务数据</div>
        </div>
        <div v-else class="loading-tip">加载中...</div>
        
        <div class="pagination-section" v-if="!loading">
          <div class="pagination-info">
            共 {{ total }} 条记录，第 {{ currentPage }} 页
          </div>
          <div class="pagination-divider">|</div>
          <div class="pagination-controls">
            <select v-model="pageSize" class="page-size-select" @change="handlePageSizeChange">
              <option :value="10">10条/页</option>
              <option :value="20">20条/页</option>
              <option :value="50">50条/页</option>
              <option :value="100">100条/页</option>
            </select>
            <button
              class="btn btn-sm"
              :disabled="currentPage === 1"
              @click="goToPreviousPage"
            >
              上一页
            </button>
            <button
              class="btn btn-sm"
              :disabled="currentPage * pageSize >= total"
              @click="goToNextPage"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 测试面板弹窗 -->
    <Teleport to="body">
      <div class="modal-overlay" v-if="showTestPanel" @click.self="closeTestPanel">
        <div class="modal-container">
          <McpTestPanel
            :configId="selectedService!.Id"
            :serviceName="selectedService!.Name"
            @close="closeTestPanel"
            @confirmed="handleTestConfirmed"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { apiBaseUrl, authorizedFetch } from '../http';
import McpTestPanel from '../components/McpTestPanel.vue';

interface ServiceConfig {
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

interface Account {
  Id: number;
  Name: string;
  AuthInfo: string;
  ConfigId: number;
  Status: string;
  CreateTime: string;
  UpdateTime: string;
}

interface ApiResponse {
  code: number;
  message: string;
  data: {
    list: ServiceConfig[];
    total: number;
  };
}

const searchKeyword = ref('');
const serviceList = ref<ServiceConfig[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const loading = ref(false);
const testedServices = ref<Set<number>>(new Set());
const accounts = ref<Record<number, Account[]>>({});
const accountUpdateTime = ref<Record<number, string>>({});

const testedCount = computed(() => {
  return testedServices.value.size;
});

// 测试面板状态
const showTestPanel = ref(false);
const selectedService = ref<ServiceConfig | null>(null);

// 获取测试状态样式类
const getStatusClass = (status: number): string => {
  switch (status) {
    case 1: return 'tested';
    case -1: return 'failed';
    default: return 'untested';
  }
};

// 获取测试状态文本
const getStatusText = (status: number): string => {
  switch (status) {
    case 1: return '已通过';
    case -1: return '已失败';
    default: return '未测试';
  }
};

// 打开测试面板
const openTestPanel = (service: ServiceConfig) => {
  selectedService.value = service;
  showTestPanel.value = true;
};

// 关闭测试面板
const closeTestPanel = () => {
  showTestPanel.value = false;
  selectedService.value = null;
};

// 测试确认回调
const handleTestConfirmed = (status: number) => {
  if (selectedService.value) {
    // 更新本地列表中的状态
    const service = serviceList.value.find(s => s.Id === selectedService.value!.Id);
    if (service) {
      service.TestStatus = status;
    }
    // 更新已测试集合
    if (status === 1) {
      testedServices.value.add(selectedService.value.Id);
    } else {
      testedServices.value.delete(selectedService.value.Id);
    }
  }
};

const fetchAccounts = async (configId: number) => {
  try {
    const params = new URLSearchParams({
      page: '1',
      size: '100',
      config_id: configId.toString()
    });
    
    const response = await authorizedFetch(`${apiBaseUrl}api/admin/mcp/service/config/account/list?${params.toString()}`, { method: 'GET' });
    
    if (!response.ok) {
      if (response.status === 401) {
        console.error('Unauthorized: Token may be expired');
        return;
      }
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.code === 0) {
        const accountList = data.data.list || [];
        
        if (accountList.length > 0) {
          console.log(`服务 ${configId} 账号完整数据:`, JSON.stringify(accountList[0], null, 2));
        }
        
        const activeAccounts = accountList.filter((account: Account) => account.Status === 'used');
        
        if (activeAccounts.length > 0) {
          const latestUpdateTime = activeAccounts.reduce((latest: string, account: Account) => {
            return account.UpdateTime > latest ? account.UpdateTime : latest;
          }, '');
          const cachedUpdateTime = accountUpdateTime.value[configId];
          
          const needsUpdate = !cachedUpdateTime || cachedUpdateTime !== latestUpdateTime;
          console.log(`服务 ${configId}: 启用账号数=${activeAccounts.length}, 缓存时间=${cachedUpdateTime}, 最新时间=${latestUpdateTime}, 是否更新=${needsUpdate}`);
          
          if (needsUpdate) {
            accountUpdateTime.value[configId] = latestUpdateTime;
            accounts.value[configId] = activeAccounts;
          }
        } else {
          accounts.value[configId] = [];
        }
      }
  } catch (err) {
    console.error('Failed to fetch accounts:', err);
  }
};

const fetchServices = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      page: currentPage.value.toString(),
      size: pageSize.value.toString()
    });

    if (searchKeyword.value.trim()) {
      params.append('search', searchKeyword.value.trim());
    }
    
    const response = await authorizedFetch(`${apiBaseUrl}api/admin/data/service-config/list?${params.toString()}`, { method: 'GET' });
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data: ApiResponse = await response.json();
    if (data.code === 0) {
      serviceList.value = (data.data.list || []).map((item: any) => ({
        Id: item.id,
        Name: item.name,
        Description: item.description,
        WemcpName: item.wemcp_name,
        Tags: Array.isArray(item.tags) ? item.tags.join(',') : '',
        AccountRequired: item.account_required,
        TestStatus: item.test_status,
        OnlineStatus: item.online_status,
        CreateTime: item.create_time,
        UpdateTime: item.update_time
      }));
      total.value = data.data.total || 0;
      
      console.log('服务列表数据:', serviceList.value[0]);
      
      const accountPromises: Promise<void>[] = [];
      
      for (const service of serviceList.value) {
        if (service.AccountRequired === 1) {
          accountPromises.push(fetchAccounts(service.Id));
        }
      }
      
      await Promise.all(accountPromises);
      
      testedServices.value.clear();
      for (const service of serviceList.value) {
        if (service.TestStatus === 1) {
          testedServices.value.add(service.Id);
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch services:', err);
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  currentPage.value = 1;
  fetchServices();
};

const goToPreviousPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
    fetchServices();
  }
};

const goToNextPage = () => {
  if (currentPage.value * pageSize.value < total.value) {
    currentPage.value++;
    fetchServices();
  }
};

const handlePageSizeChange = () => {
  currentPage.value = 1;
  fetchServices();
};

onMounted(() => {
  fetchServices();
});
</script>

<style scoped>
.service-list-container {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e0e6ed;
}

.page-header h1 {
  font-size: 1.3rem;
  color: #2c3e50;
  margin: 0;
}

.service-test {
  height: calc(100vh - 120px);
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  padding: 12px;
  background: #f5f7fa;
}

.service-panel {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-box input {
  padding: 6px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 0.9rem;
  width: 200px;
}

.search-box input:focus {
  outline: none;
  border-color: #409eff;
}

.btn-search {
  background-color: #409eff;
  color: #fff;
}

.btn-search:hover {
  background-color: #66b1ff;
}

.panel-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #1a1a2e;
}

.service-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 280px);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 #f1f5f9;
}

.service-list::-webkit-scrollbar {
  width: 8px;
}

.service-list::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

.service-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.service-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.pagination-section {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-top: 15px;
  border-top: 1px solid #e0e6ed;
}

.pagination-info {
  color: #7f8c8d;
  font-size: 0.9rem;
}

.pagination-divider {
  padding: 0 15px;
  color: #d0d7de;
  font-size: 0.9rem;
}

.pagination-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.page-size-select {
  padding: 6px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #606266;
  background-color: #fff;
  cursor: pointer;
  outline: none;
}

.page-size-select:focus {
  border-color: #409eff;
}

.service-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.service-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.account-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 500;
  background: #e0e7ff;
  color: #4338ca;
}

.service-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.service-id {
  font-size: 0.85rem;
  color: #6b7280;
  font-weight: 500;
  padding: 4px 8px;
  background-color: #f3f4f6;
  border-radius: 6px;
  min-width: 80px;
  text-align: center;
}

.service-name {
  font-size: 0.95rem;
  color: #1f2937;
  font-weight: 500;
}

.type-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

.type-badge.stdio {
  background: #dbeafe;
  color: #065f46;
}

.type-badge.sse {
  background: #d1fae5;
  color: #7c3aed;
}

.type-badge.httpStreamable {
  background: #fef3c7;
  color: #92400e;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-badge.tested {
  background-color: #52c41a;
  color: #fff;
}

.status-badge.untested {
  background-color: #909399;
  color: #fff;
}

.status-badge.failed {
  background-color: #ef4444;
  color: #fff;
}

.btn-test {
  background: #3b82f6;
  color: #fff;
}

.btn-test:hover {
  background: #2563eb;
}

.empty-tip {
  text-align: center;
  padding: 40px;
  color: #9ca3af;
  font-size: 0.95rem;
}

.loading-tip {
  text-align: center;
  padding: 40px;
  color: #6b7280;
  font-size: 0.95rem;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.btn:active {
  transform: translateY(0);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.85rem;
}

.btn-refresh {
  background: #f0f0f0;
  color: #333;
}

.btn-refresh:hover {
  background: #e0e0e0;
}

.btn-primary {
  background: #2563eb;
  color: #fff;
}

.btn-primary:hover {
  background: #1d4ed8;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn-secondary:hover {
  background: #d1d5db;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 8px;
}

.modal-container {
  width: 98vw;
  max-width: none;
  height: 95vh;
  max-height: none;
  background: transparent;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
</style>
