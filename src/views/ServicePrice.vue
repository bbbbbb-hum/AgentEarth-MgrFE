<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';

interface ServiceItem {
  Id: number;
  ServerName: string;
  ServerId: string;
  Price: number;
  Enabled: boolean;
}

interface ApiResponse {
  code: number;
  message: string;
  data: {
    list: ServiceItem[];
    total: number;
  };
}

const loading = ref(false);
const toastMessage = ref('');
const toastType = ref<'success' | 'error'>('success');

const showToast = (message: string, type: 'success' | 'error' = 'success') => {
  toastMessage.value = message;
  toastType.value = type;
  setTimeout(() => {
    toastMessage.value = '';
  }, 2000);
};

const serviceList = ref<ServiceItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);

const searchKeyword = ref('');
const sortField = ref('');
const sortOrder = ref('');
const selectedIds = ref<number[]>([]);
const isSelectingAll = ref(false);
const showBatchPriceInput = ref(false);
const batchPrice = ref<number>(0);
const filterStatus = ref(0); // 0: All, 1: Available, 2: Unavailable


const editingCell = ref<{ rowId: number; field: string } | null>(null);
const editingPrice = ref<number>(0);
const priceInput = ref<HTMLInputElement | null>(null);

const apiBaseUrl = import.meta.env.BASE_URL;

const isGlobalSelection = ref(false);

const allSelected = computed(() => {
  if (isGlobalSelection.value) return true;
  return serviceList.value.length > 0 && selectedIds.value.length === serviceList.value.length;
});

const toggleSelectAll = (event: Event) => {
  const checkbox = event.target as HTMLInputElement;
  if (checkbox.checked) {
    // Enable global selection
    isGlobalSelection.value = true;
    selectedIds.value = []; // Clear manual IDs as global covers everything
  } else {
    // Disable global selection
    isGlobalSelection.value = false;
    selectedIds.value = [];
  }
};

const isRowSelected = (id: number) => {
  return isGlobalSelection.value || selectedIds.value.includes(id);
};

const toggleSelection = (id: number) => {
  if (isGlobalSelection.value) {
    // If in global mode and user unchecks one, switch to manual mode
    // We can only select the current page items minus the one unchecked
    isGlobalSelection.value = false;
    selectedIds.value = serviceList.value
      .map(item => item.Id)
      .filter(itemId => itemId !== id);
  } else {
    // Standard toggle
    const index = selectedIds.value.indexOf(id);
    if (index === -1) {
      selectedIds.value.push(id);
    } else {
      selectedIds.value.splice(index, 1);
    }
  }
};

const fetchServiceList = async () => {
  loading.value = true;

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('请先登录', 'error');
      // 可以在这里跳转到登录页
      // router.push('/login');
      return;
    }

    const params = new URLSearchParams({
      page: currentPage.value.toString(),
      size: pageSize.value.toString()
    });

    if (searchKeyword.value.trim()) {
      params.append('search', searchKeyword.value.trim());
    }

    if (filterStatus.value !== 0) {
      params.append('enabled', filterStatus.value.toString());
    }

    if (sortField.value) {
      params.append('sort', sortField.value);
      params.append('order', sortOrder.value);
    }

    const response = await fetch(`${apiBaseUrl}api/admin/mcp/service/list?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) {
        showToast('登录已过期，请重新登录', 'error');
        localStorage.removeItem('token');
        // 可以在这里跳转到登录页
        // router.push('/login');
        return;
      }
      throw new Error(`Network response was not ok: ${response.status}`);
    }

    const data: ApiResponse = await response.json();

    if (data.code === 0) {
      serviceList.value = data.data.list || [];
      total.value = data.data.total || 0;
    } else {
      throw new Error(data.message || 'Failed to fetch service list');
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Failed to fetch service list', 'error');
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  currentPage.value = 1;
  fetchServiceList();
};

const handleReset = () => {
  searchKeyword.value = '';
  sortField.value = '';
  sortOrder.value = '';
  filterStatus.value = 0;
  currentPage.value = 1;
  fetchServiceList();
};

const handleStatusFilter = (status: number) => {
  filterStatus.value = status;
  currentPage.value = 1;
  fetchServiceList();
};

const startEditPrice = async (item: ServiceItem) => {
  if (editingCell.value?.rowId === item.Id && editingCell.value?.field === 'price') return;
  editingCell.value = { rowId: item.Id, field: 'price' };
  editingPrice.value = item.Price;
  await nextTick();
  const input = document.getElementById(`price-input-${item.Id}`) as HTMLInputElement;
  if (input) input.focus();
};

const cancelEdit = () => {
  editingCell.value = null;
};

const savePrice = async (item: ServiceItem) => {
  // Check if we are editing this item
  if (editingCell.value?.rowId !== item.Id) return;

  // Capture value immediately to avoid race conditions
  const priceToSave = Number(editingPrice.value);

  // If price hasn't changed, just close the edit mode
  if (priceToSave === item.Price) {
    if (editingCell.value?.rowId === item.Id) {
      editingCell.value = null;
    }
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiBaseUrl}api/admin/mcp/service/update/price`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      credentials: 'include',
      body: JSON.stringify({
        server_id: item.ServerId,
        price: priceToSave
      }),
    });

    const data = await response.json();
    if (data.code === 0) {
      showToast('价格更新成功', 'success');
      
      // Update the item in the current list (handles case where list was refreshed)
      const currentItem = serviceList.value.find(i => i.Id === item.Id);
      if (currentItem) {
        currentItem.Price = priceToSave;
      } else {
        item.Price = priceToSave;
      }
      
      // Only close edit mode if we are still editing THIS item
      if (editingCell.value?.rowId === item.Id) {
        editingCell.value = null;
      }
    } else {
      throw new Error(data.message || '更新失败');
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新失败', 'error');
  }
};

const handlePageChange = (newPage: number) => {
  currentPage.value = newPage;
  fetchServiceList();
};

const handlePageSizeChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  pageSize.value = Number(target.value);
  currentPage.value = 1;
  fetchServiceList();
};

const totalPages = computed(() => Math.ceil(total.value / pageSize.value));

const handleSort = (field: string, order: string) => {
  sortField.value = field;
  sortOrder.value = order;
  currentPage.value = 1;
  fetchServiceList();
};

const handlePriceInput = (event: Event, type: 'batch' | 'single') => {
  const target = event.target as HTMLInputElement;
  let value = target.value;
  
  // Allow decimal
  const numVal = parseFloat(value);
  if (!isNaN(numVal)) {
    const finalVal = Math.max(0, numVal);
    if (type === 'batch') {
      batchPrice.value = finalVal;
    } else {
      editingPrice.value = finalVal;
    }
  }
};

const startBatchUpdate = async () => {
  if (!isGlobalSelection.value && selectedIds.value.length === 0) {
    showToast('请选择要修改的服务', 'error');
    return;
  }
  batchPrice.value = 0; // Reset price to 0
  showBatchPriceInput.value = true;
  await nextTick();
  const input = document.querySelector('.batch-price-input') as HTMLInputElement;
  if (input) input.focus();
};

const cancelBatchUpdate = () => {
  showBatchPriceInput.value = false;
  batchPrice.value = 0;
};

const handleBatchUpdatePrice = async () => {
  if (!isGlobalSelection.value && selectedIds.value.length === 0) return;
  
  loading.value = true;
  
  try {
    const payload: any = {
      price: Number(batchPrice.value),
      is_all: isGlobalSelection.value,
      ids: isGlobalSelection.value ? [] : selectedIds.value
    };

    if (isGlobalSelection.value) {
      payload.search = searchKeyword.value.trim();
      if (filterStatus.value !== 0) {
        payload.enabled = filterStatus.value;
      }
    }

    const token = localStorage.getItem('token');
    const response = await fetch(`${apiBaseUrl}api/admin/mcp/service/batch-update-price`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.code === 0) {
      showToast('批量更新价格成功', 'success');
      showBatchPriceInput.value = false;
      batchPrice.value = 0;
      selectedIds.value = [];
      isSelectingAll.value = false;
      isGlobalSelection.value = false;
      fetchServiceList();
    } else {
      throw new Error(data.message || '批量更新失败');
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '批量更新失败', 'error');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchServiceList();
});
</script>

<template>
  <div class="service-list-container">
    <transition name="fade">
      <div v-if="toastMessage" :class="['toast-message', `toast-${toastType}`]">
        {{ toastMessage }}
      </div>
    </transition>

    <div class="content-wrapper">
      <div class="section-header">
        <h2 class="section-title">星量MCP服务价格管理列表</h2>
      </div>
      <div class="service-actions">
        <div class="selection-info">
          <span v-if="isGlobalSelection">已选择全部 <span class="selection-count">{{ total }}</span> 条服务</span>
          <span v-else>已选择 <span class="selection-count">{{ selectedIds.length }}</span> 条</span>
        </div>

        <div class="search-box">
          <input 
            v-model="searchKeyword" 
            type="text" 
            placeholder="按名称或ID搜索" 
            @keyup.enter="handleSearch"
            class="search-input" 
          />
          <button class="btn btn-primary btn-lg" @click="handleSearch">搜索</button>
          <button class="btn btn-secondary btn-lg" @click="handleReset">重置</button>
        </div>

        <div class="batch-actions">
          <div v-if="showBatchPriceInput" class="batch-price-form">
            <input 
              v-model="batchPrice" 
              type="number" 
              placeholder="输入统一价格" 
              class="batch-price-input"
              step="any"
              min="0"
              @input="(event) => handlePriceInput(event, 'batch')"
              @keyup.enter="handleBatchUpdatePrice"
            />
            <button class="btn btn-primary btn-sm" @click="handleBatchUpdatePrice">确认</button>
            <button class="btn btn-secondary btn-sm" @click="cancelBatchUpdate">取消</button>
          </div>
          <button v-else class="btn btn-warning btn-lg" @click="startBatchUpdate">批量修改价格</button>
        </div>
      </div>

      <div class="table-section">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th class="checkbox-column"><input type="checkbox" :checked="allSelected" @change="toggleSelectAll" /></th>
                <th>ID</th>
                <th>MCP名称</th>
                <th class="price-header">
                  <div class="header-with-menu">
                    <span>单次价格 (点击修改)</span>
                    <div class="dropdown">
                      <button class="dropdown-toggle" :class="{ 'active': sortField === 'price' }">
                        ⋮
                        <span v-if="sortField === 'price'" class="sort-indicator">
                          {{ sortOrder === 'asc' ? '↑' : '↓' }}
                        </span>
                      </button>
                      <div class="dropdown-menu">
                        <div class="dropdown-item" :class="{ 'active': sortField === 'price' && sortOrder === 'asc' }" @click="handleSort('price', 'asc')">升序排列</div>
                        <div class="dropdown-item" :class="{ 'active': sortField === 'price' && sortOrder === 'desc' }" @click="handleSort('price', 'desc')">降序排列</div>
                        <div class="dropdown-item" @click="handleSort('', '')">恢复默认</div>
                      </div>
                    </div>
                  </div>
                </th>
                <th>
                  <div class="header-with-menu">
                    <span>状态</span>
                    <div class="dropdown">
                      <button class="dropdown-toggle" :class="{ 'active': filterStatus !== 0 }">
                        ⋮
                      </button>
                      <div class="dropdown-menu">
                        <div class="dropdown-item" :class="{ 'active': filterStatus === 0 }" @click="handleStatusFilter(0)">全部</div>
                        <div class="dropdown-item" :class="{ 'active': filterStatus === 1 }" @click="handleStatusFilter(1)">可用</div>
                        <div class="dropdown-item" :class="{ 'active': filterStatus === 2 }" @click="handleStatusFilter(2)">不可用</div>
                      </div>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in serviceList" :key="item.Id">
                <td class="checkbox-column"><input type="checkbox" :checked="isRowSelected(item.Id)" @change="toggleSelection(item.Id)" /></td>
                <td>{{ item.Id }}</td>
                <td>{{ item.ServerName }}</td>
                <td @click="startEditPrice(item)" class="editable-cell">
                  <div v-if="editingCell?.rowId === item.Id && editingCell?.field === 'price'" class="edit-input-wrapper" @click.stop>
                    <input 
                      :id="`price-input-${item.Id}`"
                      type="number" 
                      v-model="editingPrice" 
                      @blur="savePrice(item)" 
                      @keyup.enter="savePrice(item)"
                      @keyup.esc="cancelEdit"
                      step="any"
                      min="0"
                      @input="(event: Event) => handlePriceInput(event, 'single')"
                    />
                  </div>
                  <span v-else>{{ item.Price }}</span>
                </td>
                <td>
                  <span :class="['status-tag', item.Enabled ? 'status-active' : 'status-inactive']">
                    {{ item.Enabled ? '可用' : '不可用' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <div class="pagination-info">
            <span>共 {{ total }} 条</span>
            <select :value="pageSize" @change="handlePageSizeChange" class="page-size-select">
              <option value="10">10 条/页</option>
              <option value="20">20 条/页</option>
              <option value="50">50 条/页</option>
              <option value="100">100 条/页</option>
            </select>
          </div>
          <div class="pagination-controls">
            <button class="btn btn-secondary" :disabled="currentPage === 1" @click="handlePageChange(currentPage - 1)">上一页</button>
            <span class="page-number">第 {{ currentPage }} / {{ totalPages }} 页</span>
            <button class="btn btn-secondary" :disabled="currentPage >= totalPages" @click="handlePageChange(currentPage + 1)">下一页</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.service-list-container {
  padding: 20px;
  width: 100%;
  box-sizing: border-box;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

.section-header {
  margin-bottom: 0.5px;
  padding-bottom: 10px;
  border-bottom: 2px solid #e0e6ed;
}

.section-title {
  margin: 0;
  font-size: 1.3rem;
  color: #2c3e50;
}

.service-actions {
  display: flex;
  gap: 15px;
  margin-bottom: 0.5px;
  align-items: center;
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  gap: 10px;
  align-items: center;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.batch-price-form {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: #fff9f0;
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px solid #ffeeba;
}

.batch-price-input {
  width: 120px;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  outline: none;
}

.batch-price-input:focus {
  border-color: #f39c12;
}

.selection-info { color: #666; margin-right: 5px; }
.selection-count { color: #3498db; font-weight: bold; }
.search-input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; width: 250px; }

.table-section {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  width: 100%;
  box-sizing: border-box;
}

.table-wrapper {
  overflow-x: auto;
  margin-bottom: 20px;
  width: 100%;
}

.data-table { width: 100%; border-collapse: collapse; min-width: 800px; }
.data-table th { background-color: #f8f9fa; font-weight: 600; text-align: left; padding: 12px; border-bottom: 2px solid #eee; color: #555; }
.data-table td { padding: 12px; border-bottom: 1px solid #eee; color: #333; }
.checkbox-column { width: 40px; text-align: center; }

.header-with-menu {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 1.2rem;
  color: #666;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.dropdown-toggle.active {
  color: #3498db;
  background-color: #f0f7ff;
}

.sort-indicator {
  font-size: 0.8rem;
  font-weight: bold;
}

.dropdown-toggle:hover {
  background-color: #eee;
}

.dropdown-menu {
  display: none;
  position: absolute;
  right: 0;
  background-color: white;
  min-width: 120px;
  box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
  z-index: 100;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #eee;
}

.dropdown:hover .dropdown-menu {
  display: block;
}

.dropdown-item {
  color: #333;
  padding: 10px 16px;
  text-decoration: none;
  display: block;
  font-size: 0.9rem;
  font-weight: normal;
  text-align: left;
  cursor: pointer;
}

.dropdown-item:hover {
  background-color: #f1f1f1;
}

.dropdown-item.active {
  color: #3498db;
  background-color: #f0f7ff;
  font-weight: bold;
}

.status-tag { padding: 4px 10px; border-radius: 12px; font-size: 0.85rem; font-weight: 500; }
.status-active { background-color: #e8f5e9; color: #2ecc71; }
.status-inactive { background-color: #ffebee; color: #e74c3c; }

.editable-cell { cursor: pointer; position: relative; min-width: 100px; }
.editable-cell:hover { background-color: #f0f7ff; }
.edit-input-wrapper input { width: 100%; padding: 4px 8px; border: 1px solid #3498db; border-radius: 4px; outline: none; }

.pagination { margin-top: 20px; display: flex; align-items: center; justify-content: space-between; }
.pagination-info { display: flex; align-items: center; gap: 15px; color: #666; font-size: 0.9rem; }
.pagination-controls { display: flex; align-items: center; gap: 10px; }
.page-size-select { padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; color: #333; outline: none; cursor: pointer; }
.page-size-select:focus { border-color: #3498db; }
.page-number { font-weight: 500; color: #333; }

.btn { padding: 8px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; transition: background 0.2s; }
.btn-primary { background-color: #3498db; color: white; }
.btn-primary:hover { background-color: #2980b9; }
.btn-secondary { background-color: #95a5a6; color: white; }
.btn-secondary:hover { background-color: #7f8c8d; }
.btn-warning { background-color: #f39c12; color: white; }
.btn-warning:hover { background-color: #e67e22; }
.btn-sm { padding: 4px 10px; font-size: 0.8rem; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }

.alert { padding: 15px; margin-bottom: 20px; border-radius: 4px; color: white; font-weight: 500; }
.alert-error { background-color: #e74c3c; }

.toast-message {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  color: white;
  padding: 12px 30px;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.2);
  z-index: 2000;
  font-weight: 500;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 300px;
}

.toast-icon {
  font-size: 1.2rem;
  font-weight: bold;
}

.toast-success {
  background-color: #2ecc71;
}

.toast-error {
  background-color: #e74c3c;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}


</style>
