<template>
  <div class="service-online-container">
    <div class="page-header">
      <h1>外部MCP服务上线状态管理列表</h1>
    </div>
    
    <div v-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <div v-if="success" class="alert alert-success">
      {{ success }}
    </div>
    
    <div class="service-online">
      <div class="service-panel">
        <div class="panel-header">
          <span class="panel-title">已测试服务</span>
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
              <span class="status-badge" :class="service.OnlineStatus === 1 ? 'online' : 'offline'">
                {{ service.OnlineStatus === 1 ? '已上线' : '已下线' }}
              </span>
            </div>
            
            <div class="service-actions">
              <button
                class="btn btn-sm"
                :class="service.OnlineStatus === 1 ? 'btn-offline' : 'btn-online'"
                @click="toggleOnline(service)"
                :disabled="processingId === service.Id"
              >
                {{ service.OnlineStatus === 1 ? '下线' : '上线' }}
                <span v-if="processingId === service.Id" class="loading-spinner"></span>
              </button>
            </div>
          </div>
          <div v-if="serviceList.length === 0" class="empty-tip">暂无已测试的服务</div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { apiBaseUrl, authorizedFetch } from '../http';

interface ServiceConfig {
  Id: number;
  Name: string;
  Description: string;
  CreateTime: string;
  UpdateTime: string;
  WemcpName: string;
  Tags: string;
  AccountRequired: number;
  TestStatus: number;
  OnlineStatus: number;
}

interface ApiResponse {
  code: number;
  message: string;
  data: {
    list: ServiceConfig[];
    total: number;
  };
}

const currentPage = ref(1);
const pageSize = ref(10);
const serviceList = ref<ServiceConfig[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const processingId = ref<number | null>(null);
const success = ref('');
const searchKeyword = ref('');

const fetchServices = async () => {
  loading.value = true;
  error.value = '';
  
  try {
    const params = new URLSearchParams({
      page: currentPage.value.toString(),
      size: pageSize.value.toString(),
      filter_test_status: '1'
    });
    
    if (searchKeyword.value.trim()) {
      params.append('search', searchKeyword.value.trim());
    }
    
    const requestUrl = `${apiBaseUrl}api/admin/data/service-config/list?${params.toString()}`;
    console.log('[ServiceOnline] fetchServices request', requestUrl);
    const response = await authorizedFetch(requestUrl, { method: 'GET' });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[ServiceOnline] fetchServices response error', response.status, errorText);
      throw new Error('Network response was not ok');
    }
    
    const data: ApiResponse = await response.json();
    console.log('[ServiceOnline] fetchServices response', data);
    
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
    } else {
      throw new Error(data.message || 'Failed to fetch service list');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch service list';
    console.error('Error fetching services:', err);
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  currentPage.value = 1;
  fetchServices();
};

const toggleOnline = async (service: ServiceConfig) => {
  const newStatus = service.OnlineStatus === 1 ? 0 : 1;
  processingId.value = service.Id;
  error.value = '';
  success.value = '';
  const actionText = newStatus === 1 ? '上线' : '下线';
  try {
    const requestUrl = `${apiBaseUrl}api/admin/data/update-service-online`;
    const payload = {
      id: service.Id,
      online_status: newStatus
    };
    console.log('[ServiceOnline] toggleOnline request', requestUrl, payload);
    const response = await authorizedFetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[ServiceOnline] toggleOnline response error', response.status, errorText);
      throw new Error('Network response was not ok');
    }
    
    const data = await response.json();
    console.log('[ServiceOnline] toggleOnline response', data);
    
    if (data.code === 0) {
      success.value = `服务${actionText}成功`;
      setTimeout(() => {
        success.value = '';
      }, 1000);
      const serviceToUpdate = serviceList.value.find((s: ServiceConfig) => s.Id === service.Id);
      if (serviceToUpdate) {
        serviceToUpdate.OnlineStatus = newStatus;
      }
    } else {
      throw new Error(data.message || `${actionText}失败`);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : `${actionText}失败`;
    console.error('Error toggling online status:', err);
  } finally {
    processingId.value = null;
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

const handlePageSizeChange = () => {
  currentPage.value = 1;
  fetchServices();
};

onMounted(() => {
  fetchServices();
});
</script>

<style scoped>
.service-online-container {
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

.alert {
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 20px;
  font-size: 0.9rem;
}

.alert-error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.alert-success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.service-online {
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

.service-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  transition: all 0.2s;
}

.service-item:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.service-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
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

.status-badge.online {
  background-color: #52c41a;
  color: #fff;
}

.status-badge.offline {
  background-color: #909399;
  color: #fff;
}

.service-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.btn-refresh {
  background: #f0f0f0;
  color: #333;
}

.btn-refresh:hover {
  background: #e0e0e0;
}

.btn-online {
  background-color: #3b82f6;
  color: #fff;
}

.btn-online:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-offline {
  background-color: #ef4444;
  color: #fff;
}

.btn-offline:hover:not(:disabled) {
  background-color: #dc2626;
}

.btn-cancel {
  background-color: #f3f4f6;
  color: #111827;
}

.btn-cancel:hover:not(:disabled) {
  background-color: #e5e7eb;
}

.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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

.pagination-section {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-top: 15px;
  border-top: 1px solid #e5e7eb;
}

.pagination-info {
  font-size: 0.9rem;
  color: #6b7280;
}

.pagination-divider {
  color: #d1d5db;
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

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.modal-content {
  width: 520px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  padding: 16px 18px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row label {
  font-size: 0.85rem;
  color: #6b7280;
}

.form-row input,
.form-row select,
.form-row textarea {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.9rem;
}

.input-disabled {
  background-color: #f5f7fa;
  color: #909399;
  cursor: not-allowed;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
</style>
