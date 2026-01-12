<template>
  <div class="service-list-container">
    <div class="page-header">
      <h1>MCP服务测试列表</h1>
    </div>
    
    <div class="service-test">
      <div class="service-panel">
        <div class="panel-header">
          <span class="panel-title">已录入服务</span>
          <button class="btn btn-sm btn-refresh" @click="fetchServices">刷新</button>
        </div>
        
        <div class="service-list" v-if="!loading">
          <div 
            v-for="service in filteredServices" 
            :key="service.Id"
            class="service-item"
          >
            <div class="service-info">
              <span class="service-id">ID: {{ service.Id }}</span>
              <span class="service-name">{{ service.Name }}</span>
              <span class="type-badge" :class="service.Type">{{ getTypeLabel(service.Type) }}</span>
              <span class="status-badge" :class="service.TestStatus === 1 ? 'tested' : 'untested'">
                {{ service.TestStatus === 1 ? '已测试' : '未测试' }}
              </span>
            </div>
            <div class="service-actions">
              <button 
                class="btn btn-sm"
                :class="service.TestStatus === 1 ? 'btn-cancel-test' : 'btn-test'"
                @click="testService(service)"
              >
                {{ service.TestStatus === 1 ? '取消测试' : '测试' }}
              </button>
            </div>
          </div>
          <div v-if="filteredServices.length === 0" class="empty-tip">暂无服务数据</div>
        </div>
        <div v-else class="loading-tip">加载中...</div>
        
        <div class="pagination-section" v-if="!loading">
          <div class="pagination-info">
            共 {{ total }} 条记录，第 {{ currentPage }} 页
          </div>
          <div class="pagination-divider">|</div>
          <div class="pagination-controls">
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

interface ServiceConfig {
  Id: number;
  Name: string;
  Type: string;
  Description: string;
  ProjectName: string;
  MaxInstance: number;
  CreateTime: string;
  UpdateTime: string;
  LaunchInfo: string;
  ConnectInfo: string;
  InstallInfo: string;
  AccountRequired: number;
  TestStatus: number;
  OnlineStatus: number;
  ExternalServiceId: string;
  ServerId: string;
  CreateStatus: boolean;
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

const filteredServices = computed(() => {
  if (!searchKeyword.value.trim()) {
    return serviceList.value;
  }
  const keyword = searchKeyword.value.toLowerCase();
  return serviceList.value.filter(s => 
    s.Name.toLowerCase().includes(keyword) ||
    s.Description?.toLowerCase().includes(keyword)
  );
});

const testedCount = computed(() => {
  return testedServices.value.size;
});

const getTypeLabel = (type: string) => {
  const typeMap: Record<string, string> = {
    'stdio': '标准输入输出',
    'sse': 'SSE连接',
    'httpStreamable': 'HTTP流'
  };
  return typeMap[type] || type;
};

const fetchAccounts = async (configId: number) => {
  try {
    const params = new URLSearchParams({
      page: '1',
      size: '100',
      config_id: configId.toString()
    });
    
    const response = await fetch(`/api/admin/mcp/service/config/account/list?${params.toString()}`);
    if (!response.ok) throw new Error('Network response was not ok');
    
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
    
    const response = await fetch(`/api/admin/data/service-config/list?${params.toString()}`);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data: ApiResponse = await response.json();
    if (data.code === 0) {
      serviceList.value = (data.data.list || []).map((item: any) => ({
        Id: item.id,
        Name: item.name,
        Type: item.type,
        Description: item.description,
        ProjectName: item.project_name,
        MaxInstance: item.max_instance,
        LaunchInfo: item.launch_info,
        ConnectInfo: item.connect_info,
        InstallInfo: item.install_info,
        AccountRequired: item.account_required,
        TestStatus: item.test_status,
        OnlineStatus: item.online_status,
        ExternalServiceId: item.external_service_id,
        ServerId: item.server_id,
        CreateStatus: item.create_status,
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

const testService = async (service: ServiceConfig) => {
  try {
    const newStatus = service.TestStatus === 1 ? 0 : 1;
    
    const response = await fetch('/api/admin/data/update/service-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: service.Id,
        test_status: newStatus
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to update test status:', errorText);
      alert('更新测试状态失败: ' + errorText);
      return;
    }
    
    const data = await response.json();
    if (data.code === 0) {
      const serviceToUpdate = serviceList.value.find(s => s.Id === service.Id);
      if (serviceToUpdate) {
        serviceToUpdate.TestStatus = newStatus;
      }
      if (newStatus === 1) {
        testedServices.value.add(service.Id);
      } else {
        testedServices.value.delete(service.Id);
      }
    } else {
      alert('更新测试状态失败: ' + (data.message || '未知错误'));
    }
  } catch (err) {
    console.error('Error updating test status:', err);
    alert('更新测试状态时发生错误');
  }
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
  gap: 10px;
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

.btn-test {
  background: #3b82f6;
  color: #fff;
}

.btn-test:hover {
  background: #2563eb;
}

.btn-cancel-test {
  background: #ef4444;
  color: #fff;
}

.btn-cancel-test:hover {
  background: #dc2626;
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
</style>
