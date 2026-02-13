<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, reactive } from 'vue';
import AddModal from '../components/AddModal.vue';
import AccountSupplement from '../components/AccountSupplement.vue';
import { apiBaseUrl, authorizedFetch } from '../http';

interface ServiceConfig {
  Id: number;
  Name: string;
  WemcpName: string;
  Tags: string;
  Description: string;
  Comments: string;
  CodeSourceUrl: string;
  CreateTime: string;
  UpdateTime: string;
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

const loading = ref(false);
const error = ref('');
const success = ref('');

const serviceList = ref<ServiceConfig[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);

const searchKeyword = ref('');
const selectedIds = ref<number[]>([]);
const isSelectingAll = ref(false);

const showAddModal = ref(false);
const editingCell = ref<{ rowId: number; field: string } | null>(null);
const editingData = ref<Partial<ServiceConfig>>({});
const tableContainer = ref<HTMLElement | null>(null);
const accountSupplementConfigId = ref<number | null>(null);
const columnWidths = ref<Record<string, number>>({});
const resizingColumn = ref<string | null>(null);
const startX = ref(0);
const startWidth = ref(0);

const filters = reactive<Record<string, string | undefined>>({});
const showFilterInput = reactive<Record<string, boolean>>({});
const sortField = ref<string>('');
const sortOrder = ref<'asc' | 'desc'>('asc');
const activeFilterField = ref<string | null>(null);

const allSelected = computed({
  get() {
    if (isSelectingAll.value) {
      return true;
    }
    return serviceList.value.length > 0 && selectedIds.value.length === serviceList.value.length;
  },
  set(value: boolean) {
    if (value) {
      selectAllServices();
    } else {
      selectedIds.value = [];
      isSelectingAll.value = false;
    }
  }
});

const hasSelection = computed(() => selectedIds.value.length > 0);

const isSearching = computed(() => searchKeyword.value.trim().length > 0);

const selectAllServices = async () => {
  loading.value = true;
  error.value = '';
  
  try {
    const allIds: number[] = [];
    let page = 1;
    const size = 100;
    
    while (true) {
      const params = new URLSearchParams({
        page: page.toString(),
        size: size.toString()
      });
      
      if (searchKeyword.value.trim()) {
        params.append('search', searchKeyword.value.trim());
      }
      
      if (sortField.value) {
        params.append('sort_field', sortField.value);
        params.append('sort_order', sortOrder.value);
      }
      
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          let filterKey = key;
          if (key === 'wemcpName') {
            filterKey = 'wemcp_name';
          }
          if (key === 'accountRequired') {
            filterKey = 'account_required';
          }
          if (key === 'testStatus') {
            filterKey = 'test_status';
          }
          if (key === 'onlineStatus') {
            filterKey = 'online_status';
          }
          params.append(`filter_${filterKey}`, filters[key]);
        }
      });
      
      const response = await authorizedFetch(`${apiBaseUrl}api/admin/data/service-config/list?${params.toString()}`, { method: 'GET' });
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data: ApiResponse = await response.json();
      
      if (data.code === 0) {
        const pageIds = data.data.list.map((item: ServiceConfig) => item.Id);
        allIds.push(...pageIds);
        
        if (data.data.list.length < size) {
          break;
        }
        page++;
      } else {
        throw new Error(data.message || 'Failed to fetch all services');
      }
    }
    
    selectedIds.value = allIds;
    isSelectingAll.value = true;
    console.log('Selected all services:', allIds.length);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch all services';
    console.error('Error selecting all services:', err);
  } finally {
    loading.value = false;
  }
};

const fetchServiceList = async () => {
  loading.value = true;
  error.value = '';
  
  try {
    const params = new URLSearchParams({
      page: currentPage.value.toString(),
      size: pageSize.value.toString()
    });
    
    if (searchKeyword.value.trim()) {
      params.append('search', searchKeyword.value.trim());
    }
    
    if (sortField.value) {
      params.append('sort_field', sortField.value);
      params.append('sort_order', sortOrder.value);
      console.log('Sort params:', sortField.value, sortOrder.value);
    }
    
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        let filterKey = key;
        if (key === 'wemcpName') {
          filterKey = 'wemcp_name';
        }
        if (key === 'accountRequired') {
          filterKey = 'account_required';
        }
        if (key === 'testStatus') {
          filterKey = 'test_status';
        }
        if (key === 'onlineStatus') {
          filterKey = 'online_status';
        }
        params.append(`filter_${filterKey}`, filters[key]);
      }
    });
    
    const response = await authorizedFetch(`${apiBaseUrl}api/admin/data/service-config/list?${params.toString()}`, { method: 'GET' });
    
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    
    const data: ApiResponse = await response.json();
    
    console.log('API Response:', data);
    console.log('Service List:', data.data.list);
    
    if (data.code === 0) {
      serviceList.value = (data.data.list || []).map((item: any) => ({
        Id: item.id,
        Name: item.name,
        WemcpName: item.wemcp_name,
        Tags: Array.isArray(item.tags) ? item.tags.join(',') : '',
        Description: item.description,
        Comments: item.comments,
        CodeSourceUrl: item.code_source_url,
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
    console.error('Error fetching service list:', err);
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
  currentPage.value = 1;
  fetchServiceList();
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

const isEditingCell = (rowId: number, field: string) => {
  return editingCell.value?.rowId === rowId && editingCell.value?.field === field;
};

const startCellEdit = async (item: ServiceConfig, field: string, event: MouseEvent) => {
  console.log('Start cell edit called', item.Id, field);
  console.log('Original item.AccountRequired:', item.AccountRequired, 'Type:', typeof item.AccountRequired);
  
  if (editingCell.value && (editingCell.value.rowId !== item.Id || editingCell.value.field !== field)) {
    console.log('Saving previous edit before starting new one');
    await saveEdit(editingCell.value.rowId, true);
  }
  
  event.stopPropagation();
  editingCell.value = { rowId: item.Id, field };
  editingData.value = { ...item };
  console.log('Editing cell set to', editingCell.value);
  console.log('editingData.AccountRequired after copy:', editingData.value.AccountRequired, 'Type:', typeof editingData.value.AccountRequired);
};

const cancelEdit = () => {
  editingCell.value = null;
  editingData.value = {};
};

const handleGlobalClick = async (event: MouseEvent) => {
  console.log('Global click triggered', editingCell.value);
  if (!editingCell.value) return;
  
  const target = event.target as HTMLElement;
  const editingCellElement = target.closest('.editing-cell');
  console.log('Target:', target, 'Editing cell element:', editingCellElement);
  
  if (!editingCellElement) {
    console.log('Saving...');
    await saveEdit(editingCell.value.rowId, true);
  }
};

const handleTableClick = async (event: MouseEvent) => {
  console.log('Table click triggered', editingCell.value);
  if (!editingCell.value) {
    console.log('No editing cell, returning');
    return;
  }
  
  const target = event.target as HTMLElement;
  const editingCellElement = target.closest('.editing-cell');
  const clickedCell = target.closest('td');
  
  console.log('Target:', target, 'Editing cell element:', editingCellElement, 'Clicked cell:', clickedCell);
  
  if (!editingCellElement && clickedCell) {
    console.log('Saving...');
    await saveEdit(editingCell.value.rowId, true);
  } else {
    console.log('Not saving - clicked in editing cell or not in a table cell');
  }
};

const startResize = (columnKey: string, event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  resizingColumn.value = columnKey;
  startX.value = event.clientX;
  
  const th = event.target as HTMLElement;
  const cell = th.closest('th') as HTMLElement;
  const rect = cell.getBoundingClientRect();
  startWidth.value = rect.width;
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (event: MouseEvent) => {
  if (!resizingColumn.value) return;
  
  const diff = event.clientX - startX.value;
  const newWidth = Math.max(50, startWidth.value + diff);
  columnWidths.value[resizingColumn.value] = newWidth;
};

const handleMouseUp = () => {
  resizingColumn.value = null;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
};

const getColumnStyle = (columnKey: string, defaultWidth?: number) => {
  const width = columnWidths.value[columnKey] || defaultWidth;
  return width ? { width: `${width}px`, minWidth: `${width}px` } : {};
};

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  
  // 检查点击是否在筛选框、按钮或输入框上
  const isClickOnDropdown = target.closest('.dropdown-menu');
  const isClickOnButton = target.closest('.menu-btn');
  const isClickOnFilterInput = target.closest('.filter-input');
  
  // 如果点击的不是筛选框、按钮或输入框，则关闭筛选框和输入框
  if (!isClickOnDropdown && !isClickOnButton && !isClickOnFilterInput) {
    // 关闭下拉菜单
    activeFilterField.value = null;
    
    // 关闭所有输入框
    Object.keys(showFilterInput).forEach(key => {
      showFilterInput[key] = false;
    });
  }
};

onMounted(() => {
  console.log('Component mounted');
  fetchServiceList();
  
  // 添加全局点击事件监听器，用于关闭筛选框
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  // 移除全局点击事件监听器
  document.removeEventListener('click', handleClickOutside);
});

const saveEdit = async (id: number, isAutoSave: boolean = false) => {
  loading.value = true;
  error.value = '';
  
  try {
    const parseTags = (value?: string) => {
      if (!value) return [];
      return value
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
    };

    const requestData: any = {
      id,
      name: editingData.value.Name,
      description: editingData.value.Description,
      wemcp_name: editingData.value.WemcpName,
      tags: parseTags(editingData.value.Tags),
      comments: editingData.value.Comments,
      code_source_url: editingData.value.CodeSourceUrl,
      account_required: typeof editingData.value.AccountRequired !== 'undefined' ? Number(editingData.value.AccountRequired) : undefined,
      test_status: typeof editingData.value.TestStatus !== 'undefined' ? Number(editingData.value.TestStatus) : undefined,
      online_status: typeof editingData.value.OnlineStatus !== 'undefined' ? Number(editingData.value.OnlineStatus) : undefined,
    };

    console.log('Sending request:', requestData);
    
    const response = await authorizedFetch(`${apiBaseUrl}api/admin/data/update/service-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error('Network response was not ok');
    }
    
    const data = await response.json();
    console.log('Response data:', data);
    
    if (data.code === 0) {
      if (!isAutoSave) {
        success.value = '保存成功！';
        setTimeout(() => {
          success.value = '';
        }, 3000);
      }
      editingCell.value = null;
      editingData.value = {};
      fetchServiceList();
    } else {
      throw new Error(data.message || '保存失败');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败';
    console.error('Error saving service:', err);
  } finally {
    loading.value = false;
  }
};

const openAddModal = () => {
  showAddModal.value = true;
};

const closeModals = () => {
  showAddModal.value = false;
};

const handleDelete = async () => {
  console.log('[Delete] 开始删除操作');
  console.log('[Delete] selectedIds:', selectedIds.value);
  console.log('[Delete] selectedIds.length:', selectedIds.value.length);
  
  if (!confirm(`确定要删除选中的 ${selectedIds.value.length} 条数据吗？`)) {
    console.log('[Delete] 用户取消删除');
    return;
  }
  
  loading.value = true;
  error.value = '';
  
  const deleteBody = {
    ids: selectedIds.value
  };
  console.log('[Delete] 发送删除请求:', JSON.stringify(deleteBody, null, 2));
  
  try {
    const response = await authorizedFetch(`${apiBaseUrl}api/admin/mcp/service/config/delete`, {
      method: 'DELETE',
      body: JSON.stringify(deleteBody)
    });
    
    console.log('[Delete] 响应状态:', response.status, response.statusText);

    if (!response.ok) {
      if (response.status === 401) {
        error.value = '登录已过期，请重新登录';
        localStorage.removeItem('token');
        return;
      }
      const errorText = await response.text();
      throw new Error(errorText || '删除失败');
    }

    const contentType = response.headers.get('content-type') || '';
    let data: any = null;
    if (contentType.includes('application/json')) {
      data = await response.json();
      console.log('[Delete] 响应数据:', JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      data = text ? { code: -1, message: text } : null;
      if (text) {
        console.log('[Delete] 响应数据:', text);
      }
    }
    
    if (!data || data.code === 0) {
      success.value = '删除成功！';
      selectedIds.value = [];
      console.log('[Delete] 删除成功，清空选择并刷新列表');
      fetchServiceList();
      setTimeout(() => {
        success.value = '';
      }, 3000);
      return;
    }

    console.log('[Delete] 删除失败:', data.message);
    throw new Error(data.message || '删除失败');
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败';
    console.error('[Delete] 删除异常:', err);
  } finally {
    loading.value = false;
    console.log('[Delete] 删除操作完成');
  }
};

const handleSave = async (formData: any) => {
  loading.value = true;
  error.value = '';
  
  try {
    const normalizedData = {
      ...formData,
      account_required: Number(formData?.account_required ?? 0),
      test_status: 0,
      online_status: 0
    };
    const response = await authorizedFetch(`${apiBaseUrl}api/admin/data/create/service-config-manual`, {
      method: 'POST',
      body: JSON.stringify(normalizedData)
    });
    
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    
    const data = await response.json();
    
    if (data.code === 0) {
      success.value = '保存成功！';
      closeModals();
      fetchServiceList();
      setTimeout(() => {
        success.value = '';
      }, 3000);
    } else {
      throw new Error(data.message || '保存失败');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败';
    console.error('Error saving service:', err);
  } finally {
    loading.value = false;
  }
};

const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN');
};

const getTypeLabel = (type: string) => {
  const typeMap: Record<string, string> = {
    'stdio': '标准输入输出',
    'sse': 'SSE连接',
    'httpStreamable': 'HTTP流'
  };
  return typeMap[type] || type;
};

const openAccountSupplement = (configId: number) => {
  accountSupplementConfigId.value = configId;
};

const closeAccountSupplement = () => {
  accountSupplementConfigId.value = null;
};

const toggleSort = (field: string) => {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortField.value = field;
    sortOrder.value = 'asc';
  }
  fetchServiceList();
};

const setSort = (field: string, order: 'asc' | 'desc') => {
  sortField.value = field;
  sortOrder.value = order;
  fetchServiceList();
};

const clearSort = () => {
  sortField.value = '';
  sortOrder.value = 'asc';
  fetchServiceList();
};

const toggleFilter = (field: string) => {
  if (filters[field]) {
    delete filters[field];
  } else {
    filters[field] = '';
  }
};

const toggleFilterInput = (field: string) => {
  if (showFilterInput[field]) {
    showFilterInput[field] = false;
  } else {
    showFilterInput[field] = true;
    if (filters[field] === undefined) {
      filters[field] = '';
    }
  }
  activeFilterField.value = null;
  fetchServiceList();
};

const applyFilters = () => {
  currentPage.value = 1;
  fetchServiceList();
};

const clearFilters = () => {
  Object.keys(filters).forEach(key => delete filters[key]);
  sortField.value = '';
  sortOrder.value = 'asc';
  fetchServiceList();
};

const handlePageChange = (newPage: number) => {
  currentPage.value = newPage;
  fetchServiceList();
};

const handlePageSizeChange = () => {
  currentPage.value = 1;
  fetchServiceList();
};

</script>

<template>
  <div class="service-list-container">
    <div v-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <div v-if="success" class="alert alert-success">
      {{ success }}
    </div>

    <div class="content-wrapper">
      <div class="section-header">
        <h2 class="section-title">外部MCP服务录入列表</h2>
      </div>

      <div class="table-section">
        <div class="service-actions">
          <div class="selection-info">
            已选择 <span class="selection-count">{{ selectedIds.length }}</span> 条
          </div>
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="按名称搜索"
            @keyup.enter="handleSearch"
          />
          <button class="btn btn-primary btn-lg" @click="handleSearch">
            搜索
          </button>
          <button class="btn btn-secondary btn-lg" @click="handleReset">
            重置
          </button>
          <button v-if="Object.keys(filters).length > 0 || sortField" class="btn btn-warning btn-lg" @click="clearFilters">
            清除筛选
          </button>
          <button class="btn btn-primary btn-lg" @click="openAddModal">
            新增
          </button>
          <button
            class="btn btn-danger btn-lg"
            :disabled="!hasSelection"
            @click="handleDelete"
          >
            删除
          </button>
        </div>
        <div class="table-wrapper" ref="tableContainer" @click="handleTableClick">
          <table class="data-table">
            <thead>
              <tr>
                <th class="checkbox-column" :style="getColumnStyle('checkbox', 60)">
                  <input
                    type="checkbox"
                    v-model="allSelected"
                    :disabled="serviceList.length === 0"
                    :title="isSelectingAll ? '已全选所有数据' : '点击全选所有数据'"
                  />
                  <div class="resize-handle" @mousedown="startResize('checkbox', $event)"></div>
                </th>
                <th :style="getColumnStyle('id', 80)">
                  ID
                  <div class="resize-handle" @mousedown="startResize('id', $event)"></div>
                </th>
                <th :style="getColumnStyle('name', 150)">
                  <div class="th-content">
                    <span class="th-text">服务名称</span>
                    <div class="th-actions">
                      <button class="menu-btn" @click.stop="activeFilterField = activeFilterField === 'name' ? null : 'name'" title="更多选项">
                        ⋯
                      </button>
                      <div v-if="activeFilterField === 'name'" class="dropdown-menu" @click.stop>
                        <div class="menu-item" @click="setSort('name', 'asc')">
                          <span v-if="sortField === 'name' && sortOrder === 'asc'">✓ </span>
                          升序排序
                        </div>
                        <div class="menu-item" @click="setSort('name', 'desc')">
                          <span v-if="sortField === 'name' && sortOrder === 'desc'">✓ </span>
                          降序排序
                        </div>
                        <div class="menu-item" @click="clearSort" v-if="sortField === 'name'">
                          移除排序
                        </div>
                        <div class="menu-divider"></div>
                        <div class="menu-item" @click="toggleFilterInput('name')">
                          <span v-if="showFilterInput.name">✓ </span>
                          {{ showFilterInput.name ? '移除筛选' : '添加筛选' }}
                        </div>
                      </div>
                      <div v-if="showFilterInput.name" class="filter-input" @click.stop>
                        <input 
                          v-model="filters.name" 
                          type="text" 
                          placeholder="输入服务名称"
                          @keyup.enter="fetchServiceList"
                          @input="fetchServiceList"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="resize-handle" @mousedown="startResize('name', $event)"></div>
                </th>
                <th :style="getColumnStyle('wemcpName', 180)">
                  <div class="th-content">
                    <span class="th-text">WemcpName</span>
                    <div class="th-actions">
                      <button class="menu-btn" @click.stop="activeFilterField = activeFilterField === 'wemcpName' ? null : 'wemcpName'" title="更多选项">
                        ⋯
                      </button>
                      <div v-if="activeFilterField === 'wemcpName'" class="dropdown-menu" @click.stop>
                        <div class="menu-item" @click="setSort('wemcpName', 'asc')">
                          <span v-if="sortField === 'wemcpName' && sortOrder === 'asc'">✓ </span>
                          升序排序
                        </div>
                        <div class="menu-item" @click="setSort('wemcpName', 'desc')">
                          <span v-if="sortField === 'wemcpName' && sortOrder === 'desc'">✓ </span>
                          降序排序
                        </div>
                        <div class="menu-item" @click="clearSort" v-if="sortField === 'wemcpName'">
                          移除排序
                        </div>
                        <div class="menu-divider"></div>
                        <div class="menu-item" @click="toggleFilterInput('wemcpName')">
                          <span v-if="showFilterInput.wemcpName">✓ </span>
                          {{ showFilterInput.wemcpName ? '移除筛选' : '添加筛选' }}
                        </div>
                      </div>
                      <div v-if="showFilterInput.wemcpName" class="filter-input" @click.stop>
                        <input
                          v-model="filters.wemcpName"
                          type="text"
                          placeholder="输入 wemcp_name"
                          @keyup.enter="fetchServiceList"
                          @input="fetchServiceList"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="resize-handle" @mousedown="startResize('wemcpName', $event)"></div>
                </th>
                <th :style="getColumnStyle('tags', 160)">
                  Tags
                  <div class="resize-handle" @mousedown="startResize('tags', $event)"></div>
                </th>
                <th :style="getColumnStyle('codeSourceUrl', 200)">
                  源地址
                  <div class="resize-handle" @mousedown="startResize('codeSourceUrl', $event)"></div>
                </th>
                <th :style="getColumnStyle('comments', 160)">
                  备注
                  <div class="resize-handle" @mousedown="startResize('comments', $event)"></div>
                </th>
                <th :style="getColumnStyle('accountRequired', 120)">
                  <div class="th-content">
                    <span class="th-text">是否需要账号</span>
                    <div class="th-actions">
                      <button class="menu-btn" @click.stop="activeFilterField = activeFilterField === 'accountRequired' ? null : 'accountRequired'" title="更多选项">
                        ⋯
                      </button>
                      <div v-if="activeFilterField === 'accountRequired'" class="dropdown-menu" @click.stop>
                        <div class="menu-item" @click="setSort('accountRequired', 'asc')">
                          <span v-if="sortField === 'accountRequired' && sortOrder === 'asc'">✓ </span>
                          升序排序
                        </div>
                        <div class="menu-item" @click="setSort('accountRequired', 'desc')">
                          <span v-if="sortField === 'accountRequired' && sortOrder === 'desc'">✓ </span>
                          降序排序
                        </div>
                        <div class="menu-item" @click="clearSort" v-if="sortField === 'accountRequired'">
                          移除排序
                        </div>
                        <div class="menu-divider"></div>
                        <div class="menu-item" @click="toggleFilterInput('accountRequired')">
                          <span v-if="showFilterInput.accountRequired">✓ </span>
                          {{ showFilterInput.accountRequired ? '移除筛选' : '添加筛选' }}
                        </div>
                      </div>
                      <div v-if="showFilterInput.accountRequired" class="filter-input" @click.stop>
                        <select v-model="filters.accountRequired" @change="fetchServiceList">
                          <option value="">全部</option>
                          <option value="1">是</option>
                          <option value="0">否</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div class="resize-handle" @mousedown="startResize('accountRequired', $event)"></div>
                </th>
                <th :style="getColumnStyle('testStatus', 100)">
                  <div class="th-content">
                    <span class="th-text">测试状态</span>
                    <div class="th-actions">
                      <button class="menu-btn" @click.stop="activeFilterField = activeFilterField === 'testStatus' ? null : 'testStatus'" title="更多选项">
                        ⋯
                      </button>
                      <div v-if="activeFilterField === 'testStatus'" class="dropdown-menu" @click.stop>
                        <div class="menu-item" @click="setSort('testStatus', 'asc')">
                          <span v-if="sortField === 'testStatus' && sortOrder === 'asc'">✓ </span>
                          升序排序
                        </div>
                        <div class="menu-item" @click="setSort('testStatus', 'desc')">
                          <span v-if="sortField === 'testStatus' && sortOrder === 'desc'">✓ </span>
                          降序排序
                        </div>
                        <div class="menu-item" @click="clearSort" v-if="sortField === 'testStatus'">
                          移除排序
                        </div>
                        <div class="menu-divider"></div>
                        <div class="menu-item" @click="toggleFilterInput('testStatus')">
                          <span v-if="showFilterInput.testStatus">✓ </span>
                          {{ showFilterInput.testStatus ? '移除筛选' : '添加筛选' }}
                        </div>
                      </div>
                      <div v-if="showFilterInput.testStatus" class="filter-input" @click.stop>
                        <select v-model="filters.testStatus" @change="fetchServiceList">
                          <option value="">全部</option>
                          <option value="1">已测试</option>
                          <option value="0">未测试</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div class="resize-handle" @mousedown="startResize('testStatus', $event)"></div>
                </th>
                <th :style="getColumnStyle('onlineStatus', 100)">
                  <div class="th-content">
                    <span class="th-text">就绪状态</span>
                    <div class="th-actions">
                      <button class="menu-btn" @click.stop="activeFilterField = activeFilterField === 'onlineStatus' ? null : 'onlineStatus'" title="更多选项">
                        ⋯
                      </button>
                      <div v-if="activeFilterField === 'onlineStatus'" class="dropdown-menu" @click.stop>
                        <div class="menu-item" @click="setSort('onlineStatus', 'asc')">
                          <span v-if="sortField === 'onlineStatus' && sortOrder === 'asc'">✓ </span>
                          升序排序
                        </div>
                        <div class="menu-item" @click="setSort('onlineStatus', 'desc')">
                          <span v-if="sortField === 'onlineStatus' && sortOrder === 'desc'">✓ </span>
                          降序排序
                        </div>
                        <div class="menu-item" @click="clearSort" v-if="sortField === 'onlineStatus'">
                          移除排序
                        </div>
                        <div class="menu-divider"></div>
                        <div class="menu-item" @click="toggleFilterInput('onlineStatus')">
                          <span v-if="showFilterInput.onlineStatus">✓ </span>
                          {{ showFilterInput.onlineStatus ? '移除筛选' : '添加筛选' }}
                        </div>
                      </div>
                      <div v-if="showFilterInput.onlineStatus" class="filter-input" @click.stop>
                        <select v-model="filters.onlineStatus" @change="fetchServiceList">
                          <option value="">全部</option>
                          <option value="1">已就绪</option>
                          <option value="0">未就绪</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div class="resize-handle" @mousedown="startResize('onlineStatus', $event)"></div>
                </th>
                <th :style="getColumnStyle('description', 200)">
                  描述
                  <div class="resize-handle" @mousedown="startResize('description', $event)"></div>
                </th>
                <th :style="getColumnStyle('createTime', 180)">
                  创建时间
                  <div class="resize-handle" @mousedown="startResize('createTime', $event)"></div>
                </th>
                <th :style="getColumnStyle('updateTime', 180)">
                  更新时间
                  <div class="resize-handle" @mousedown="startResize('updateTime', $event)"></div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading && serviceList.length === 0">
                <td colspan="13" class="loading-cell">
                  加载中...
                </td>
              </tr>
              <tr v-else-if="serviceList.length === 0">
                <td colspan="13" class="empty-cell">
                  {{ isSearching ? '未找到该服务' : '暂无数据' }}
                </td>
              </tr>
              <tr v-else v-for="item in serviceList" :key="item.Id">
                <td class="checkbox-column">
                  <input
                    type="checkbox"
                    :checked="isSelected(item.Id)"
                    @change="toggleSelection(item.Id)"
                  />
                </td>
                <td>{{ item.Id }}</td>
                <td v-if="!isEditingCell(item.Id, 'Name')" @click="(e) => startCellEdit(item, 'Name', e)">{{ item.Name }}</td>
                <td v-else class="editing-cell" @click.stop>
                  <input v-model="editingData.Name" type="text" class="inline-input" />
                </td>
                <td v-if="!isEditingCell(item.Id, 'WemcpName')" @click="(e) => startCellEdit(item, 'WemcpName', e)">{{ item.WemcpName }}</td>
                <td v-else class="editing-cell" @click.stop>
                  <input v-model="editingData.WemcpName" type="text" class="inline-input" />
                </td>
                <td v-if="!isEditingCell(item.Id, 'Tags')" @click="(e) => startCellEdit(item, 'Tags', e)">{{ item.Tags }}</td>
                <td v-else class="editing-cell" @click.stop>
                  <input v-model="editingData.Tags" type="text" class="inline-input" />
                </td>
                <td v-if="!isEditingCell(item.Id, 'CodeSourceUrl')" @click="(e) => startCellEdit(item, 'CodeSourceUrl', e)">{{ item.CodeSourceUrl }}</td>
                <td v-else class="editing-cell" @click.stop>
                  <input v-model="editingData.CodeSourceUrl" type="text" class="inline-input" />
                </td>
                <td v-if="!isEditingCell(item.Id, 'Comments')" @click="(e) => startCellEdit(item, 'Comments', e)">{{ item.Comments }}</td>
                <td v-else class="editing-cell" @click.stop>
                  <input v-model="editingData.Comments" type="text" class="inline-input" />
                </td>
                <td v-if="!isEditingCell(item.Id, 'AccountRequired')" @click="(e) => startCellEdit(item, 'AccountRequired', e)">
                  <div class="account-required-cell">
                    <span>{{ item.AccountRequired === 1 ? '是' : '否' }}</span>
                    <button
                      v-if="item.AccountRequired === 1"
                      class="account-supplement-btn"
                      @click.stop="openAccountSupplement(item.Id)"
                    >
                      更新账号
                    </button>
                  </div>
                </td>
                <td v-else class="editing-cell" @click.stop>
                  <select v-model="editingData.AccountRequired" class="inline-input" @change="saveEdit(item.Id, true)">
                    <option :value="0">否</option>
                    <option :value="1">是</option>
                  </select>
                </td>
                <td>
                  {{ item.TestStatus === 1 ? '已测试' : '未测试' }}
                </td>
                <td>
                  {{ item.OnlineStatus === 1 ? '已就绪' : '未就绪' }}
                </td>
                <td v-if="!isEditingCell(item.Id, 'Description')" @click="(e) => startCellEdit(item, 'Description', e)" class="description-cell">{{ item.Description }}</td>
                <td v-else class="editing-cell" @click.stop>
                  <textarea v-model="editingData.Description" class="inline-textarea" rows="2"></textarea>
                </td>
                <td>{{ formatDate(item.CreateTime) }}</td>
                <td>{{ formatDate(item.UpdateTime) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pagination-section">
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
              @click="handlePageChange(currentPage - 1)"
            >
              上一页
            </button>
            <button
              class="btn btn-sm"
              :disabled="currentPage * pageSize >= total"
              @click="handlePageChange(currentPage + 1)"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>

    <AddModal
      v-if="showAddModal"
      @save="handleSave"
      @close="closeModals"
    />
    <AccountSupplement
      v-if="accountSupplementConfigId !== null"
      :config-id="accountSupplementConfigId"
      :service-name="serviceList.find(s => s.Id === accountSupplementConfigId)?.Name || ''"
      @close="closeAccountSupplement"
    />
  </div>
</template>

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

.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.search-section {
  background-color: #fff;
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.section-header {
  padding-bottom: 15px;
  border-bottom: 2px solid #e0e6ed;
}

.service-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
}

.section-title {
  margin: 0;
  font-size: 1.3rem;
  color: #2c3e50;
}

.search-input-group {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.selection-info {
  font-size: 0.9rem;
  color: #7f8c8d;
  height: 36px;
  display: flex;
  align-items: center;
}

.selection-count {
  font-weight: 600;
  color: #3498db;
  font-size: 1.1rem;
}

.service-actions input {
  width: 120px;
  height: 36px;
  padding: 0 15px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  font-size: 0.9rem;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.service-actions input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.table-section {
  background-color: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.table-wrapper {
  overflow-x: auto;
  margin-bottom: 16px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.data-table th,
.data-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e0e6ed;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-table th {
  background-color: #f5f7fa;
  font-weight: 600;
  color: #2c3e50;
  font-size: 0.9rem;
  position: relative;
  user-select: none;
  overflow: visible;
}

.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  background: transparent;
  transition: background-color 0.2s;
}

.resize-handle:hover,
.resize-handle:active {
  background-color: #3498db;
}

.data-table td {
  color: #555;
  font-size: 0.9rem;
}

.data-table tbody tr:hover {
  background-color: #f8f9fa;
}

.data-table tbody tr.editing-row {
  background-color: #fff3cd;
}

.data-table tbody tr.editing-row:hover {
  background-color: #fff3cd;
}

.checkbox-column {
  width: 50px;
  text-align: center;
}

.action-column {
  width: 150px;
  text-align: center;
}

.description-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 200px;
}

.edit-cell {
  padding: 4px;
}

.edit-cell .inline-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #3498db;
  border-radius: 4px;
  font-size: 0.9rem;
}

.edit-cell .inline-input:focus {
  outline: none;
  border-color: #2980b9;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.edit-cell .inline-textarea {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #3498db;
  border-radius: 4px;
  font-size: 0.9rem;
  resize: vertical;
  min-height: 60px;
}

.edit-cell .inline-textarea:focus {
  outline: none;
  border-color: #2980b9;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.type-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.type-badge.stdio {
  background-color: #d1ecf1;
  color: #0c5460;
}

.type-badge.sse {
  background-color: #d4edda;
  color: #155724;
}

.type-badge.httpStreamable {
  background-color: #fff3cd;
  color: #856404;
}

.th-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  position: relative;
}

.th-text {
  flex: 1;
}

.th-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.menu-btn {
  padding: 2px 6px;
  background: none;
  border: 1px solid #e0e6ed;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  color: #6b7280;
  transition: all 0.2s;
}

.menu-btn:hover {
  background-color: #f3f4f6;
  border-color: #cbd5e1;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 1000;
  background: white;
  border: 1px solid #e0e6ed;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  min-width: 150px;
  margin-top: 4px;
}

.menu-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s;
}

.menu-item:hover {
  background-color: #f3f4f6;
}

.menu-divider {
  height: 1px;
  background-color: #e0e6ed;
  margin: 4px 0;
}

.sort-btn,
.filter-btn {
  padding: 2px 6px;
  background: none;
  border: 1px solid #e0e6ed;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  color: #6b7280;
  transition: all 0.2s;
}

.sort-btn:hover,
.filter-btn:hover {
  background-color: #f3f4f6;
  border-color: #cbd5e1;
}

.filter-input {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  background: white;
  padding: 8px;
  border: 1px solid #e0e6ed;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-top: 4px;
}

.filter-input input,
.filter-input select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #e0e6ed;
  border-radius: 4px;
  font-size: 0.85rem;
}

.filter-input input:focus,
.filter-input select:focus {
  outline: none;
  border-color: #3498db;
}

.account-supplement-btn {
  margin-left: 8px;
  padding: 4px 8px;
  background-color: #3498db;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.account-supplement-btn:hover {
  background-color: #2980b9;
}

.account-count-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 500;
  min-width: 30px;
  text-align: center;
}

.account-count-badge.has-accounts {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.account-count-badge.no-accounts {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.account-required-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.max-instance-cell {
  text-align: center;
}

.loading-cell,
.empty-cell {
  text-align: center;
  padding: 40px;
  color: #7f8c8d;
  font-size: 0.95rem;
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

.btn-lg {
  height: 36px;
  padding: 0 20px;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-primary {
  background-color: #3498db;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2980b9;
}

.btn-secondary {
  background-color: #95a5a6;
  color: #fff;
}

.btn-secondary:hover {
  background-color: #7f8c8d;
}

.btn-warning {
  background-color: #f59e0b;
  color: #fff;
}

.btn-warning:hover:not(:disabled) {
  background-color: #d97706;
}

.btn-danger {
  background-color: #e74c3c;
  color: #fff;
}

.btn-danger:hover:not(:disabled) {
  background-color: #c0392b;
}

.btn-save {
  background-color: #28a745;
  color: #fff;
}

.btn-save:hover {
  background-color: #218838;
}

.btn-cancel {
  background-color: #6c757d;
  color: #fff;
}

.btn-cancel:hover {
  background-color: #5a6268;
}

@media (max-width: 1200px) {
  .description-cell {
    max-width: 150px;
  }
}

@media (max-width: 768px) {
  .search-input-group {
    flex-direction: column;
  }
  
  .action-bar {
    flex-direction: column;
  }
}
</style>
