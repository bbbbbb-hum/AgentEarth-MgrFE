<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue';

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
    list: Account[];
    total: number;
  };
}

const props = defineProps<{
  configId: number;
}>();

const emit = defineEmits<{
  close: [];
}>();

const loading = ref(false);
const error = ref('');
const success = ref('');
const accounts = ref<Account[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const selectedIds = ref<number[]>([]);
const isSelectingAll = ref(false);

const showAddModal = ref(false);
const newAccountName = ref('');
const newAccountAuthInfo = ref('');
const newAccountConfigId = ref('');
const newAccountStatus = ref('active');

const editingCell = ref<{ rowId: number; field: string } | null>(null);
const editingData = ref<Partial<Account>>({});

const groupedAccounts = computed(() => {
  const groups: Record<string, Account[]> = {};
  accounts.value.forEach(account => {
    const key = `${account.Name}-${account.ConfigId}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(account);
  });
  return groups;
});

const allSelected = computed({
  get() {
    if (isSelectingAll.value) {
      return true;
    }
    return accounts.value.length > 0 && selectedIds.value.length === accounts.value.length;
  },
  set(value: boolean) {
    if (value) {
      selectAllAccounts();
    } else {
      selectedIds.value = [];
      isSelectingAll.value = false;
    }
  }
});

const hasSelection = computed(() => selectedIds.value.length > 0);

const selectAllAccounts = async () => {
  loading.value = true;
  error.value = '';
  
  try {
    const allIds: number[] = [];
    let page = 1;
    const size = 100;
    
    while (true) {
      const params = new URLSearchParams({
        page: page.toString(),
        size: size.toString(),
        config_id: props.configId.toString()
      });
      
      const response = await fetch(`/api/admin/mcp/service/config/account/list?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data: ApiResponse = await response.json();
      
      if (data.code === 0) {
        const pageIds = data.data.list.map((item: Account) => item.Id);
        allIds.push(...pageIds);
        
        if (data.data.list.length < size) {
          break;
        }
        page++;
      } else {
        throw new Error(data.message || 'Failed to fetch account list');
      }
    }
    
    selectedIds.value = allIds;
    isSelectingAll.value = true;
    console.log('Selected all accounts:', allIds.length);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch all accounts';
    console.error('Error selecting all accounts:', err);
  } finally {
    loading.value = false;
  }
};

const fetchAccounts = async () => {
  console.log('fetchAccounts called with configId:', props.configId);
  loading.value = true;
  error.value = '';
  
  try {
    const params = new URLSearchParams({
      page: currentPage.value.toString(),
      size: pageSize.value.toString(),
      config_id: props.configId.toString()
    });
    
    console.log('Fetching accounts with params:', params.toString());
    
    const response = await fetch(`/api/admin/mcp/service/config/account/list?${params.toString()}`);
    
    console.log('Response status:', response.status, 'ok:', response.ok);
    
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    
    const data: ApiResponse = await response.json();
    
    console.log('Response data:', data);
    
    if (data.code === 0) {
      accounts.value = data.data.list || [];
      total.value = data.data.total || 0;
      console.log('Accounts loaded:', accounts.value.length, 'Total:', total.value);
      console.log('First account:', accounts.value[0]);
      console.log('First account keys:', accounts.value[0] ? Object.keys(accounts.value[0]) : 'No account');
    } else {
      throw new Error(data.message || 'Failed to fetch account list');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch account list';
    console.error('Error fetching account list:', err);
  } finally {
    loading.value = false;
    console.log('fetchAccounts completed, loading set to false');
  }
};

const toggleSelection = (id: number) => {
  const index = selectedIds.value.indexOf(id);
  if (index > -1) {
    selectedIds.value.splice(index, 1);
  } else {
    selectedIds.value.push(id);
  }
};

const isSelected = (id: number) => {
  return selectedIds.value.includes(id);
};

const isServiceSelected = (key: string): boolean => {
  const groupAccounts = groupedAccounts.value[key];
  if (!groupAccounts || groupAccounts.length === 0) return false;
  return groupAccounts.every(account => selectedIds.value.includes(account.Id));
};

const toggleServiceSelection = (key: string) => {
  const groupAccounts = groupedAccounts.value[key];
  if (!groupAccounts || groupAccounts.length === 0) return;
  
  const allSelected = groupAccounts.every(account => selectedIds.value.includes(account.Id));
  
  if (allSelected) {
    selectedIds.value = selectedIds.value.filter(id => 
      !groupAccounts.some(account => account.Id === id)
    );
  } else {
    groupAccounts.forEach(account => {
      if (!selectedIds.value.includes(account.Id)) {
        selectedIds.value.push(account.Id);
      }
    });
  }
};

const openAddModal = () => {
  console.log('openAddModal called, current loading state:', loading.value);
  console.log('showAddModal before:', showAddModal.value);
  showAddModal.value = true;
  console.log('showAddModal after:', showAddModal.value);
};

const closeAddModal = () => {
  showAddModal.value = false;
  newAccountName.value = '';
  newAccountAuthInfo.value = '';
  newAccountConfigId.value = '';
  newAccountStatus.value = 'active';
};

const handleCreateAccount = async () => {
  if (!newAccountAuthInfo.value.trim()) {
    error.value = '请输入认证信息';
    return;
  }
  
  loading.value = true;
  error.value = '';
  
  try {
    const configId = props.configId;
    const account = accounts.value.find(acc => acc.ConfigId === configId);
    const serviceName = account?.Name || '';
    
    const response = await fetch('/api/admin/mcp/service/config/account/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: serviceName,
        auth_info: newAccountAuthInfo.value,
        config_id: configId,
        status: newAccountStatus.value
      })
    });
    
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    
    const data = await response.json();
    
    if (data.code === 0) {
      success.value = '创建成功！';
      closeAddModal();
      fetchAccounts();
      setTimeout(() => {
        success.value = '';
      }, 3000);
    } else {
      throw new Error(data.message || '创建失败');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '创建失败';
    console.error('Error creating account:', err);
  } finally {
    loading.value = false;
  }
};

const handleDelete = async () => {
  if (!confirm(`确定要删除选中的 ${selectedIds.value.length} 条数据吗？`)) {
    return;
  }
  
  loading.value = true;
  error.value = '';
  
  try {
    const response = await fetch('/api/admin/mcp/service/config/account/delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ids: selectedIds.value
      })
    });
    
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    
    const data = await response.json();
    
    if (data.code === 0) {
      success.value = '删除成功！';
      selectedIds.value = [];
      fetchAccounts();
      setTimeout(() => {
        success.value = '';
      }, 3000);
    } else {
      throw new Error(data.message || '删除失败');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败';
    console.error('Error deleting accounts:', err);
  } finally {
    loading.value = false;
  }
};

const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const isEditingCell = (rowId: number, field: string) => {
  return editingCell.value?.rowId === rowId && editingCell.value?.field === field;
};

const startCellEdit = (item: Account, field: string, event: MouseEvent) => {
  event.stopPropagation();
  editingCell.value = { rowId: item.Id, field };
  editingData.value = { ...item };
};

const saveEdit = async (id: number, isAutoSave: boolean = false) => {
  loading.value = true;
  error.value = '';
  
  try {
    const account = accounts.value.find(acc => acc.Id === id);
    if (!account) return;
    
    const requestData: any = {
      id: id,
      name: account?.Name || '',
      status: editingData.value.Status
    };
    
    if (editingData.value.AuthInfo && typeof editingData.value.AuthInfo === 'string' && editingData.value.AuthInfo.trim() !== '') {
      requestData.auth_info = editingData.value.AuthInfo;
    }
    
    console.log('Updating account with data:', requestData);
    console.log('Original AuthInfo:', account?.AuthInfo);
    console.log('Editing AuthInfo:', editingData.value.AuthInfo);
    
    const response = await fetch('/api/admin/mcp/service/config/account/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    console.log('Response status:', response.status, 'ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error('Network response was not ok');
    }
    
    const data = await response.json();
    
    console.log('Update response data:', data);
    
    if (data.code === 0) {
      if (editingData.value.Status === 'used') {
        await disableOtherAccounts(id);
      }
      
      if (!isAutoSave) {
        success.value = '保存成功！';
        setTimeout(() => {
          success.value = '';
        }, 3000);
      }
      editingCell.value = null;
      editingData.value = {};
      console.log('About to call fetchAccounts');
      await fetchAccounts();
      console.log('fetchAccounts completed');
    } else {
      throw new Error(data.message || '保存失败');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败';
    console.error('Error saving account:', err);
  } finally {
    loading.value = false;
  }
};

const disableOtherAccounts = async (currentAccountId: number) => {
  const currentAccount = accounts.value.find(acc => acc.Id === currentAccountId);
  if (!currentAccount) return;
  
  const otherActiveAccounts = accounts.value.filter(
    acc => acc.ConfigId === currentAccount.ConfigId && 
    acc.Status === 'used' && 
    acc.Id !== currentAccountId
  );
  
  if (otherActiveAccounts.length === 0) return;
  
  for (const account of otherActiveAccounts) {
    try {
      await fetch('/api/admin/mcp/service/config/account/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: account.Id,
          name: account.Name || '',
          status: 'inactive'
        })
      });
    } catch (err) {
      console.error('Error disabling account:', account.Id, err);
    }
  }
};

const getServiceName = (configId: number): string => {
  const account = accounts.value.find(acc => acc.ConfigId === configId);
  return account?.Name || '';
};

const handleTableClick = (event: MouseEvent) => {
  if (!editingCell.value) return;
  
  const target = event.target as HTMLElement;
  const editingCellElement = target.closest('.editing-cell');
  const clickedCell = target.closest('td');
  const isEditableCell = target.closest('[data-editable="true"]');
  
  if (!editingCellElement && clickedCell && !isEditableCell) {
    saveEdit(editingCell.value.rowId, true);
  }
};

onMounted(() => {
  fetchAccounts();
});

onBeforeUnmount(() => {
});

watch(() => props.configId, (newConfigId) => {
  if (newConfigId) {
    currentPage.value = 1;
    selectedIds.value = [];
    fetchAccounts();
  }
});
</script>

<template>
  <div class="account-supplement-container">
    <div class="account-header">
      <h3>账号信息补充</h3>
      <button class="close-btn" @click="emit('close')">×</button>
    </div>

    <div v-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <div v-if="success" class="alert alert-success">
      {{ success }}
    </div>

    <div class="account-actions">
      <div class="selection-info">
        已选择 <span class="selection-count">{{ selectedIds.length }}</span> 条
      </div>
      <button class="btn btn-primary btn-lg" @click="openAddModal">
        新增账号
      </button>
      <button
        class="btn btn-danger btn-lg"
        :disabled="!hasSelection"
        @click="handleDelete"
      >
        删除
      </button>
    </div>

    <div class="table-wrapper" @click="handleTableClick">
      <table class="data-table">
        <tbody>
          <tr v-if="loading && accounts.length === 0">
            <td colspan="5" class="loading-cell">
              加载中...
            </td>
          </tr>
          <tr v-else-if="accounts.length === 0">
            <td colspan="5" class="empty-cell">
              暂无账号信息
            </td>
          </tr>
          <template v-else>
            <template v-for="(groupAccounts, key) in groupedAccounts" :key="key">
              <tr class="group-header-row" v-if="groupAccounts.length > 0">
                <td class="checkbox-column" style="width: 40px !important;"></td>
                <td class="service-name-column" style="width: 120px !important;">服务名称</td>
                <td class="config-id-column" style="width: 70px !important;">配置ID</td>
                <td colspan="2" class="group-empty-cell" style="width: auto !important;"></td>
              </tr>
              <tr class="group-data-row" v-if="groupAccounts.length > 0 && groupAccounts[0]">
                <td class="checkbox-column" style="width: 40px !important;">
                  <input
                    type="checkbox"
                    :checked="isServiceSelected(key)"
                    @change="toggleServiceSelection(key)"
                  />
                </td>
                <td class="service-name-column" style="width: 120px !important;">{{ groupAccounts[0].Name || 'N/A' }}</td>
                <td class="config-id-column" style="width: 70px !important;">{{ groupAccounts[0].ConfigId || 'N/A' }}</td>
                <td colspan="2" class="group-empty-cell" style="width: auto !important;"></td>
              </tr>
              <tr class="group-header-row" v-if="groupAccounts.length > 0">
                <td class="checkbox-column" style="width: 40px !important;"></td>
                <td class="auth-info-header" style="width: 50px !important;">认证信息</td>
                <td class="status-header" style="width: 10px !important;">状态</td>
                <td class="create-time-header" style="width: 80px !important;">创建时间</td>
                <td class="update-time-header" style="width: 80px !important;">更新时间</td>
              </tr>
              <tr v-for="item in groupAccounts" :key="item.Id">
                <td class="checkbox-column" style="width: 40px !important;">
                  <input
                    type="checkbox"
                    :checked="isSelected(item.Id)"
                    @change="toggleSelection(item.Id)"
                  />
                </td>
                <td v-if="!isEditingCell(item.Id, 'AuthInfo')" @click="(e) => startCellEdit(item, 'AuthInfo', e)" data-editable="true" class="auth-info-column" style="width: 50px !important;">{{ item.AuthInfo }}</td>
                <td v-else class="editing-cell auth-info-column" style="width: 50px !important;" @click.stop>
                  <textarea v-model="editingData.AuthInfo" class="inline-textarea" rows="2" @blur="saveEdit(item.Id, true)"></textarea>
                </td>
                <td v-if="!isEditingCell(item.Id, 'Status')" @click="(e) => startCellEdit(item, 'Status', e)" data-editable="true" class="status-column" style="width: 10px !important;">
                  <span class="status-badge" :class="item.Status">
                    {{ item.Status === 'used' ? '启用' : '禁用' }}
                  </span>
                </td>
                <td v-else class="editing-cell status-column" style="width: 10px !important;" @click.stop>
                  <select v-model="editingData.Status" class="inline-input" @change="saveEdit(item.Id, true)">
                    <option value="used">启用</option>
                    <option value="unused">禁用</option>
                  </select>
                </td>
                <td class="create-time-column" style="width: 80px !important;">{{ formatDate(item.CreateTime) }}</td>
                <td class="update-time-column" style="width: 80px !important;">{{ formatDate(item.UpdateTime) }}</td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>

    <div class="pagination-section">
      <div class="pagination-info">
        共 {{ total }} 条记录，第 {{ currentPage }} 页
      </div>
      <div class="pagination-divider">|</div>
      <div class="pagination-controls">
        <button
          class="btn btn-sm"
          :disabled="currentPage === 1"
          @click="currentPage--; fetchAccounts()"
        >
          上一页
        </button>
        <button
          class="btn btn-sm"
          :disabled="currentPage * pageSize >= total"
          @click="currentPage++; fetchAccounts()"
        >
          下一页
        </button>
      </div>
    </div>

    <div v-if="showAddModal" class="modal-overlay" @click="closeAddModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>新增账号</h3>
          <button class="close-btn" @click="closeAddModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>配置ID</label>
            <input
              :value="props.configId"
              type="text"
              disabled
              class="disabled-input"
            />
          </div>
          <div class="form-group">
            <label>服务名称</label>
            <input
              :value="getServiceName(props.configId)"
              type="text"
              disabled
              class="disabled-input"
            />
          </div>
          <div class="form-group">
            <label>认证信息 <span class="required">*</span></label>
            <textarea
              v-model="newAccountAuthInfo"
              rows="4"
              placeholder="请输入认证信息"
            ></textarea>
          </div>
          <div class="form-group">
            <label>状态</label>
            <select v-model="newAccountStatus">
              <option value="used">启用</option>
              <option value="unused">禁用</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeAddModal">
            取消
          </button>
          <button class="btn btn-primary" @click="handleCreateAccount">
            保存
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.account-supplement-container {
  background-color: #fff;
  border-radius: 8px;
  padding: 10px;
  margin-top: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.account-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e0e6ed;
}

.account-header h3 {
  font-size: 1.3rem;
  color: #2c3e50;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  color: #7f8c8d;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.close-btn:hover {
  background-color: #f5f7fa;
  color: #2c3e50;
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

.account-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
}

.selection-info {
  font-size: 0.9rem;
  color: #7f8c8d;
}

.selection-count {
  font-weight: 600;
  color: #3498db;
  font-size: 1.1rem;
}

.table-wrapper {
  overflow-x: auto;
  margin-bottom: 20px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  box-sizing: border-box;
}

.col-checkbox {
  width: var(--table-col-checkbox-width);
}

.col-service-name {
  width: var(--table-col-service-name-width);
}

.col-config-id {
  width: var(--table-col-config-id-width);
}

.col-auth-info {
  width: var(--table-col-auth-info-width);
}

.col-status {
  width: var(--table-col-status-width);
}

.col-create-time {
  width: var(--table-col-create-time-width);
}

.col-update-time {
  width: var(--table-col-update-time-width);
}

.data-table th,
.data-table td {
  padding: 4px 6px;
  text-align: left;
  border-bottom: 1px solid #e0e6ed;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-sizing: border-box;
}

.data-table th {
  background-color: #f5f7fa;
  font-weight: 600;
  color: #2c3e50;
  font-size: 0.9rem;
  user-select: none;
  white-space: nowrap;
}

.data-table td {
  color: #555;
  font-size: 0.9rem;
}

.data-table tbody tr:hover {
  background-color: #f8f9fa;
}

.group-header-row {
  background-color: #e9ecef;
  font-weight: 600;
}

.group-data-row {
  background-color: #f8f9fa;
}

.group-header-cell {
  padding: 12px;
  text-align: left;
  border-bottom: 2px solid #dee2e6;
  font-weight: 600;
  color: #2c3e50;
}

.checkbox-column {
  text-align: center;
  width: var(--table-col-checkbox-width) !important;
  min-width: var(--table-col-checkbox-width) !important;
  max-width: var(--table-col-checkbox-width) !important;
}

.select-all-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 20px;
}

.select-all-wrapper input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.select-all-wrapper label {
  font-size: 0.9rem;
  color: #555;
  cursor: pointer;
  user-select: none;
}

.service-name-column {
  width: var(--table-col-service-name-width) !important;
  min-width: var(--table-col-service-name-width) !important;
  max-width: var(--table-col-service-name-width) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-id-column {
  width: var(--table-col-config-id-width) !important;
  min-width: var(--table-col-config-id-width) !important;
  max-width: var(--table-col-config-id-width) !important;
  text-align: center;
}

.auth-info-header,
.auth-info-column {
  width: var(--table-col-auth-info-width) !important;
  min-width: var(--table-col-auth-info-width) !important;
  max-width: var(--table-col-auth-info-width) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-header,
.status-column {
  width: var(--table-col-status-width) !important;
  min-width: var(--table-col-status-width) !important;
  max-width: var(--table-col-status-width) !important;
  text-align: left;
}

.create-time-header,
.create-time-column {
  width: var(--table-col-create-time-width) !important;
  min-width: var(--table-col-create-time-width) !important;
  max-width: var(--table-col-create-time-width) !important;
  text-align: left;
}

.update-time-header,
.update-time-column {
  width: var(--table-col-update-time-width) !important;
  min-width: var(--table-col-update-time-width) !important;
  max-width: var(--table-col-update-time-width) !important;
  text-align: left;
}

.auth-info-cell {
  width: 200px;
  min-width: 200px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  padding: 4px !important;
}

.inline-input,
.inline-textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: inherit;
  box-sizing: border-box;
}

.inline-input:focus,
.inline-textarea:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.1);
}

.inline-textarea {
  resize: vertical;
  min-height: 60px;
  line-height: 1.4;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-badge.used {
  background-color: #d4edda;
  color: #155724;
}

.status-badge.unused {
  background-color: #f8d7da;
  color: #721c24;
}

.loading-cell,
.empty-cell {
  text-align: center;
  padding: 40px;
  color: #7f8c8d;
  font-size: 0.95rem;
}

.group-empty-cell {
  padding: 0;
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

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 0.85rem;
}

.btn-primary {
  background-color: #3498db;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2980b9;
}

.btn-danger {
  background-color: #e74c3c;
  color: #fff;
}

.btn-danger:hover:not(:disabled) {
  background-color: #c0392b;
}

.btn-secondary {
  background-color: #95a5a6;
  color: #fff;
}

.btn-secondary:hover {
  background-color: #7f8c8d;
}

.btn-active {
  background-color: #3498db;
  color: #fff;
}

.btn-active:hover {
  background-color: #2980b9;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: #fff;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e0e6ed;
}

.modal-header h3 {
  font-size: 1.2rem;
  color: #2c3e50;
  margin: 0;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-weight: 500;
  color: #2c3e50;
  font-size: 0.95rem;
}

.required {
  color: #e74c3c;
}

.form-group input,
.form-group select,
.form-group textarea {
  padding: 10px 14px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  font-size: 0.95rem;
  transition: all 0.3s ease;
  font-family: inherit;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.disabled-input {
  background-color: #f5f7fa;
  color: #6c757d;
  cursor: not-allowed;
}

.disabled-input:focus {
  outline: none;
  border-color: #d0d7de;
  box-shadow: none;
}

.form-group textarea {
  resize: vertical;
  min-height: 100px;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 15px;
  padding: 20px;
  border-top: 1px solid #e0e6ed;
}
</style>
