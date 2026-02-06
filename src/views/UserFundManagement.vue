<!--
  文件名称: UserFundManagement.vue
  功能说明: 星量用户资金管理 - 用户列表页
  创建时间: 2026-01-24
  
  主要功能:
  1. 用户列表展示（支持分页、搜索）
  2. 顶部统计卡片（总用户、今日活跃、24h充值）
  3. 用户卡片展示（余额、日均消费、动态标签）
  4. 卡片悬停特效（炫酷滑动条）
  5. 点击卡片跳转到用户详情页
  
  技术栈:
  - Vue 3 Composition API (TypeScript)
  - 响应式数据管理
  - Vue Router 路由跳转
  - CSS 动画效果
  
  数据来源:
  - GET /manager/api/userfund/stats - 统计数据
  - GET /manager/api/userfund/list - 用户列表（含日均消费）
  
  关键特性:
  - 日均消费：后端计算最近30天平均值
  - 动态标签：高价值用户、VIP、活跃、新用户、余额预警等
  - 分页功能：支持10/20/50/100/200条/页
  - 搜索功能：支持用户名/邮箱模糊搜索
-->

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiBaseUrl, authorizedFetch } from '../http';

const router = useRouter();

// 与后端 `UserFundStatsResp` / `UserListResp` 保持一致
interface UserStats {
  total_users: number;
  daily_active_users: number;
  total_recharge_24h: number;
}

interface UserItem {
  id: number;
  user_id: string;
  username: string;
  phone: string;
  email: string;
  avatar_url: string;
  status: string;
  last_login_at: string;
  create_time: string;
  balance: number;
  daily_consumption: number; // 日均消费
}

interface UserListResp {
  list: UserItem[];
  total: number;
}

// State
const stats = ref<UserStats>({
  total_users: 0,
  daily_active_users: 0,
  total_recharge_24h: 0
});

const userList = ref<UserItem[]>([]);
const totalUsers = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50, 100, 200];
const loading = ref(false);
const searchKeyword = ref('');

// 筛选和排序状态
const filterStatus = ref('all'); // all, active, inactive
const sortBy = ref('recent_login'); // recent_login, balance_desc, balance_asc, create_time
const showFilterDropdown = ref(false);
const showSortDropdown = ref(false);

// Fetch Stats
const fetchStats = async () => {
  try {
    // 使用完整路径，确保正确代理
    const url = `${apiBaseUrl}api/userfund/stats`;
    console.log('Fetching stats from:', url);
    const response = await authorizedFetch(url);
    console.log('Stats response status:', response.status, response.statusText);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch stats:', response.status, errorText);
      // 如果统计接口失败，尝试从用户列表获取总数
      // 但这里先不处理，让用户看到错误
      throw new Error(`Failed to fetch stats: ${response.status} - ${errorText}`);
    }
    // 后端直接返回 UserFundStatsResp 而不是带 code 的包装
    const res: UserStats = await response.json();
    console.log('Stats response data:', res);
    if (res && typeof res === 'object') {
      stats.value = {
        total_users: res.total_users ?? 0,
        daily_active_users: res.daily_active_users ?? 0,
        total_recharge_24h: res.total_recharge_24h ?? 0,
      };
    } else {
      console.error('Invalid stats response format:', res);
    }
  } catch (error) {
    console.error('Error fetching stats:', error);
    // 如果统计接口失败，尝试从用户列表的总数来显示
    // 但这里先保持默认值，让用户知道有问题
  }
};

// Fetch User List
const fetchUserList = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    const keyword = searchKeyword.value.trim();
    if (keyword) {
      // 前端统一转为小写，避免大小写导致的搜索差异
      params.append('search', keyword.toLowerCase());
    }
    // page / pageSize 与后端 `UserListReq` 对齐
    params.append('page', currentPage.value.toString());
    params.append('pageSize', pageSize.value.toString());

    const response = await authorizedFetch(`${apiBaseUrl}api/userfund/list?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch user list');
    // 后端直接返回 UserListResp
    const res: UserListResp = await response.json();
    let list = res.list || [];
    totalUsers.value = res.total || 0;
    
    // 如果统计接口失败，使用列表总数更新总注册用户数
    if (stats.value.total_users === 0 && totalUsers.value > 0) {
      console.log('Updating total_users from list total:', totalUsers.value);
      stats.value.total_users = totalUsers.value;
    }
    
    // 计算今日活跃用户（从列表中统计今天登录的用户）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayActiveCount = list.filter(user => {
      if (!user.last_login_at || user.last_login_at === '0001-01-01T00:00:00Z') {
        return false;
      }
      const loginDate = new Date(user.last_login_at);
      loginDate.setHours(0, 0, 0, 0);
      return loginDate.getTime() === today.getTime();
    }).length;
    
    // 如果统计接口的今日活跃为0，但列表中有今日活跃用户，更新统计数据
    if (stats.value.daily_active_users === 0 && todayActiveCount > 0) {
      console.log('Updating daily_active_users from list:', todayActiveCount);
      stats.value.daily_active_users = todayActiveCount;
    }
    
    // 前端筛选
    if (filterStatus.value === 'active') {
      // 活跃用户：最近30天内登录过
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      list = list.filter(user => {
        if (!user.last_login_at || user.last_login_at === '0001-01-01T00:00:00Z') return false;
        return new Date(user.last_login_at) >= thirtyDaysAgo;
      });
      // 更新筛选后的总数
      totalUsers.value = list.length;
    } else if (filterStatus.value === 'inactive') {
      // 不活跃用户：超过30天未登录或从未登录
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      list = list.filter(user => {
        if (!user.last_login_at || user.last_login_at === '0001-01-01T00:00:00Z') return true;
        return new Date(user.last_login_at) < thirtyDaysAgo;
      });
      // 更新筛选后的总数
      totalUsers.value = list.length;
    }
    
    // 前端排序
    list = sortUserList(list);
    
    // 调试：打印排序前后的第一个用户
    if (list.length > 0) {
      console.log('排序前第一个用户:', list[0].username, '余额:', list[0].balance, '最后登录:', list[0].last_login_at);
    }
    
    // 使用排序后的列表（sortUserList 已经根据 sortBy 进行了排序）
    userList.value = list;
    
    if (list.length > 0) {
      console.log('排序后第一个用户:', list[0].username, '余额:', list[0].balance, '最后登录:', list[0].last_login_at);
    }
  } catch (error) {
    console.error('Error fetching user list:', error);
  } finally {
    loading.value = false;
  }
};

// Helpers
const formatCount = (value: number | null | undefined) => {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return Math.trunc(num).toLocaleString('zh-CN');
};

const formatCurrency = (value: number | null | undefined) => {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (dateStr: string) => {
  if (!dateStr || dateStr === '0001-01-01T00:00:00Z') return '从未登录';
  return new Date(dateStr).toLocaleString();
};

const formatEmail = (email: string) => {
  // 检查邮箱是否有效（不为空、不为'0'、不为空字符串）
  if (!email || email.trim() === '' || email.trim() === '0' || email.trim() === 'null') {
    return '无';
  }
  // 如果邮箱长度超过35个字符，显示前30个字符加省略号
  if (email.length > 35) {
    return email.substring(0, 30) + '...';
  }
  return email;
};

// status 为字符串：active / inactive / frozen / warning 等
const getStatusText = (status: string) => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'inactive':
      return 'Inactive';
    case 'frozen':
      return 'Frozen';
    case 'warning':
      return 'Warning';
    default:
      return status || '未知';
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'active':
      return 'status-normal';
    case 'frozen':
      return 'status-banned';
    case 'warning':
      return 'status-warning';
    default:
      return 'status-unknown';
  }
};

// 标签判断逻辑
const getUserTags = (user: UserItem) => {
  const tags: Array<{ text: string; type: string }> = [];
  
  // 高价值用户：余额 > 1000
  if (user.balance > 1000) {
    tags.push({ text: '高价值用户', type: 'high-value' });
  }
  
  // VIP用户：余额 > 5000
  if (user.balance > 5000) {
    tags.push({ text: 'VIP', type: 'vip' });
  }
  
  // 余额预警：余额 < 10
  if (user.balance < 10 && user.balance > 0) {
    tags.push({ text: '余额预警', type: 'low-balance' });
  }
  
  // 活跃用户：最近7天登录过
  if (user.last_login_at && user.last_login_at !== '0001-01-01T00:00:00Z') {
    const lastLogin = new Date(user.last_login_at);
    const daysSinceLogin = (Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLogin <= 7) {
      tags.push({ text: '活跃', type: 'active' });
    }
  }
  
  // 新用户：账号注册时间在7天内
  if (user.create_time && user.create_time.trim() !== '') {
    try {
      const createTime = new Date(user.create_time);
      
      // 检查日期是否有效
      if (!isNaN(createTime.getTime())) {
        const daysSinceCreate = (Date.now() - createTime.getTime()) / (1000 * 60 * 60 * 24);
        // 确保是正数（注册时间不能是未来）且在7天内
        if (daysSinceCreate >= 0 && daysSinceCreate <= 7) {
          tags.push({ text: '新用户', type: 'new' });
        }
      } else {
        console.warn('无效的注册时间格式:', user.create_time, '用户:', user.username);
      }
    } catch (error) {
      console.warn('解析注册时间失败:', user.create_time, '用户:', user.username, error);
    }
  }
  
  return tags;
};

const handleSearch = () => {
  currentPage.value = 1; // 搜索时重置到第一页
  fetchUserList();
};

// 清空搜索条件
const clearSearch = () => {
  searchKeyword.value = '';
  currentPage.value = 1;
  fetchUserList();
};

// 前端排序函数
const sortUserList = (list: UserItem[]) => {
  console.log(`执行排序: ${sortBy.value}, 用户数量: ${list.length}`);
  const sorted = [...list];
  
  switch (sortBy.value) {
    case 'recent_login':
      // 最近活跃：按最后登录时间降序，空值排在最后
      sorted.sort((a, b) => {
        const dateA = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
        const dateB = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
        if (dateA === 0 && dateB === 0) return 0;
        if (dateA === 0) return 1;  // a 没有登录记录，排在后面
        if (dateB === 0) return -1; // b 没有登录记录，排在后面
        return dateB - dateA; // 都有记录，最新的在前
      });
      break;
      
    case 'balance_desc':
      // 余额从高到低：降序排列
      sorted.sort((a, b) => {
        const balanceA = a.balance || 0;
        const balanceB = b.balance || 0;
        return balanceB - balanceA;
      });
      break;
      
    case 'balance_asc':
      // 余额从低到高：升序排列
      sorted.sort((a, b) => {
        const balanceA = a.balance || 0;
        const balanceB = b.balance || 0;
        return balanceA - balanceB;
      });
      break;
      
    case 'create_time':
      // 最新注册：按注册时间降序，空值排在最后
      sorted.sort((a, b) => {
        const dateA = a.create_time ? new Date(a.create_time).getTime() : 0;
        const dateB = b.create_time ? new Date(b.create_time).getTime() : 0;
        if (dateA === 0 && dateB === 0) return 0;
        if (dateA === 0) return 1;  // a 没有注册时间，排在后面
        if (dateB === 0) return -1; // b 没有注册时间，排在后面
        return dateB - dateA; // 都有记录，最新的在前
      });
      break;
      
    default:
      // 默认按最近活跃排序
      sorted.sort((a, b) => {
        const dateA = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
        const dateB = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
        if (dateA === 0 && dateB === 0) return 0;
        if (dateA === 0) return 1;
        if (dateB === 0) return -1;
        return dateB - dateA;
      });
  }
  
  return sorted;
};

// 筛选和排序选项
const filterOptions = [
  { value: 'all', label: '全部用户' },
  { value: 'active', label: '活跃用户' },
  { value: 'inactive', label: '不活跃用户' }
];

const sortOptions = [
  { value: 'recent_login', label: '最近活跃' },
  { value: 'balance_desc', label: '余额从高到低' },
  { value: 'balance_asc', label: '余额从低到高' },
  { value: 'create_time', label: '最新注册' }
];

// 获取当前筛选标签
const currentFilterLabel = computed(() => {
  const option = filterOptions.find(o => o.value === filterStatus.value);
  return option ? option.label : '全部用户';
});

// 获取当前排序标签
const currentSortLabel = computed(() => {
  const option = sortOptions.find(o => o.value === sortBy.value);
  return option ? option.label : '最近活跃';
});

// 切换筛选
const toggleFilter = () => {
  showFilterDropdown.value = !showFilterDropdown.value;
  showSortDropdown.value = false;
};

// 切换排序
const toggleSort = () => {
  showSortDropdown.value = !showSortDropdown.value;
  showFilterDropdown.value = false;
};

// 选择筛选选项
const selectFilter = (value: string) => {
  filterStatus.value = value;
  showFilterDropdown.value = false;
  currentPage.value = 1; // 重置到第一页
  fetchUserList();
};

// 选择排序选项
const selectSort = (value: string) => {
  console.log(`选择排序方式: ${value}`);
  sortBy.value = value;
  showSortDropdown.value = false;
  fetchUserList();
};

// 关闭下拉菜单（点击外部）
const closeDropdowns = () => {
  showFilterDropdown.value = false;
  showSortDropdown.value = false;
};

const handlePageChange = (page: number) => {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  fetchUserList();
  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const handlePageSizeChange = () => {
  currentPage.value = 1; // 改变每页条数时重置到第一页
  fetchUserList();
};

const totalPages = computed(() => {
  return Math.ceil(totalUsers.value / pageSize.value);
});

// 生成页码数组（显示当前页前后几页）
const pageNumbers = computed(() => {
  const pages: (number | string)[] = [];
  const total = totalPages.value;
  const current = currentPage.value;
  
  if (total <= 7) {
    // 如果总页数少于7页，显示所有页码
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    // 显示逻辑：首页 ... 当前页前后各2页 ... 末页
    pages.push(1);
    
    if (current > 4) {
      pages.push('...');
    }
    
    const start = Math.max(2, current - 2);
    const end = Math.min(total - 1, current + 2);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    if (current < total - 3) {
      pages.push('...');
    }
    
    pages.push(total);
  }
  
  return pages;
});

const goToUserDetail = (userId: string) => {
  // 使用 replace 而不是 push，这样不会在导航栏创建新标签页
  router.replace(`/user-fund/${userId}`);
};

// 监听用户余额更新事件，实时更新列表中的余额
const handleBalanceUpdate = (event: Event) => {
  const customEvent = event as CustomEvent<{ user_id: string; new_balance: number }>;
  const { user_id, new_balance } = customEvent.detail;
  
  // 查找并更新对应用户的余额
  const userIndex = userList.value.findIndex(user => user.user_id === user_id);
  if (userIndex !== -1) {
    userList.value[userIndex].balance = new_balance;
    console.log(`用户 ${user_id} 的余额已更新为 ${new_balance}`);
  }
};

onMounted(() => {
  fetchStats();
  fetchUserList();
  
  // 监听用户余额更新事件
  window.addEventListener('user-balance-updated', handleBalanceUpdate);
});

onUnmounted(() => {
  // 清理事件监听器
  window.removeEventListener('user-balance-updated', handleBalanceUpdate);
});
</script>

<template>
  <div class="user-fund-container">
    <!-- Header -->
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">星量用户资金管理</h1>
        <p class="page-subtitle">实时监控用户资金流向，管理充值与消费</p>
      </div>
    </header>

    <!-- Stats Section -->
    <section class="stats-section">
      <div class="stats-card">
        <div class="stats-icon">👥</div>
        <div class="stats-content">
          <div class="stats-label">总注册用户</div>
          <div class="stats-value">{{ formatCount(stats.total_users ?? 0) }}</div>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-icon">⚡</div>
        <div class="stats-content">
          <div class="stats-label">今日活跃</div>
          <div class="stats-value">{{ formatCount(stats.daily_active_users ?? 0) }}</div>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-icon">📅</div>
        <div class="stats-content">
          <div class="stats-label">24h 充值</div>
          <div class="stats-value green-text">+{{ formatCurrency(stats.total_recharge_24h) }}</div>
        </div>
      </div>
      <!-- Placeholder for future feature -->
      <div class="stats-card">
        <div class="stats-icon">⚠️</div>
        <div class="stats-content">
          <div class="stats-label">余额预警用户</div>
          <div class="stats-value red-text">0</div>
        </div>
      </div>
    </section>

    <!-- User List Section -->
    <section class="user-list-section">
      <div class="section-header">
        <h2 class="section-title">用户目录 (共{{ formatCount(totalUsers) }}条)</h2>
        <div class="header-controls">
          <!-- 筛选和排序 -->
          <div class="filter-sort-controls">
            <!-- 筛选 -->
            <div 
              class="control-item" 
              @mouseenter="showFilterDropdown = true" 
              @mouseleave="showFilterDropdown = false"
            >
              <span class="control-icon filter-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 4.5H21M7.5 9H16.5M10.5 13.5H13.5" stroke="url(#filter-gradient)" stroke-width="2.5" stroke-linecap="round"/>
                  <defs>
                    <linearGradient id="filter-gradient" x1="3" y1="4.5" x2="21" y2="13.5" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#3b82f6"/>
                      <stop offset="100%" stop-color="#8b5cf6"/>
                    </linearGradient>
                  </defs>
                </svg>
              </span>
              <span class="control-text">筛选: {{ currentFilterLabel }}</span>
              <transition name="dropdown-fade">
                <div v-if="showFilterDropdown" class="dropdown-menu">
                  <div 
                    v-for="option in filterOptions" 
                    :key="option.value"
                    class="dropdown-item"
                    :class="{ active: filterStatus === option.value }"
                    @click.stop="selectFilter(option.value)"
                  >
                    {{ option.label }}
                  </div>
                </div>
              </transition>
            </div>
            
            <!-- 排序 -->
            <div 
              class="control-item" 
              @mouseenter="showSortDropdown = true" 
              @mouseleave="showSortDropdown = false"
            >
              <span class="control-icon sort-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 6H13M4 12H11M4 18H9M17 4V20M17 20L14 17M17 20L20 17" stroke="url(#sort-gradient)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <defs>
                    <linearGradient id="sort-gradient" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#10b981"/>
                      <stop offset="100%" stop-color="#06b6d4"/>
                    </linearGradient>
                  </defs>
                </svg>
              </span>
              <span class="control-text">排序: {{ currentSortLabel }}</span>
              <transition name="dropdown-fade">
                <div v-if="showSortDropdown" class="dropdown-menu">
                  <div 
                    v-for="option in sortOptions" 
                    :key="option.value"
                    class="dropdown-item"
                    :class="{ active: sortBy === option.value }"
                    @click.stop="selectSort(option.value)"
                  >
                    {{ option.label }}
                  </div>
                </div>
              </transition>
            </div>
          </div>
          
          <!-- 搜索框 -->
          <div class="filter-options">
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input 
                type="text" 
                v-model="searchKeyword" 
                @keyup.enter="fetchUserList"
                placeholder="搜索用户 ID / 邮箱 / 账号名" 
                class="search-input"
              />
              <button class="search-btn" @click="fetchUserList">搜索</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="loading" class="loading-state">
        加载中...
      </div>
      
      <!-- 空状态：未查询到结果 -->
      <div v-else-if="userList.length === 0" class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">未查询到结果</div>
        <div class="empty-message">
          <span v-if="searchKeyword.trim()">
            未找到与 "<strong>{{ searchKeyword }}</strong>" 相关的用户
          </span>
          <span v-else>
            暂无用户数据
          </span>
        </div>
        <div class="empty-tips">
          <p>💡 搜索提示：</p>
          <ul>
            <li>可以搜索用户ID、用户名、手机号或邮箱</li>
            <li>支持模糊匹配，不区分大小写</li>
            <li v-if="searchKeyword.trim()">
              <button class="clear-search-btn" @click="clearSearch">清空搜索条件</button>
            </li>
          </ul>
        </div>
      </div>
      
      <div v-else class="user-grid">
        <div 
          v-for="user in userList" 
          :key="user.id" 
          class="user-card"
          @click="goToUserDetail(user.user_id)"
          style="cursor: pointer;"
        >
          <!-- 底部滑动条 -->
          <div class="card-slide-bar"></div>
          <div class="card-header">
            <div class="user-avatar-container">
              <img v-if="user.avatar_url" :src="user.avatar_url" :alt="user.username" class="user-avatar" />
              <div v-else class="user-avatar-placeholder">{{ user.username.charAt(0).toUpperCase() }}</div>
            </div>
            <div class="user-info">
              <div class="user-name" :title="user.username">{{ user.username }}</div>
              <div class="user-status">
                <span class="status-dot" :class="getStatusClass(user.status)"></span>
                <span class="status-text" :class="getStatusClass(user.status)">
                  {{ getStatusText(user.status) }}
                </span>
              </div>
              <div class="user-email" :title="user.email || '无邮箱'">
                邮箱: {{ formatEmail(user.email) }}
              </div>
            </div>
          </div>

          <div class="card-body">
            <div class="balance-label">当前余额</div>
            <div class="balance-amount">{{ formatCurrency(user.balance) }}</div>
          </div>

          <div class="card-footer">
            <div class="footer-info">
              <span class="label">日均消费: {{ formatCurrency(user.daily_consumption || 0) }}</span>
            </div>
            <div class="footer-info">
              <span class="label">上次登录: {{ formatDate(user.last_login_at) }}</span>
            </div>
          </div>
          
          <div class="card-tags">
             <span 
               v-for="tag in getUserTags(user)" 
               :key="tag.type"
               class="tag"
               :class="`tag-${tag.type}`"
             >
               {{ tag.text }}
             </span>
          </div>
        </div>
      </div>

      <!-- 分页控件 -->
      <div v-if="!loading && totalUsers > 0" class="pagination-container">
        <div class="pagination-left">
          <span class="page-size-label">每页显示：</span>
          <select 
            v-model="pageSize" 
            @change="handlePageSizeChange"
            class="page-size-select"
          >
            <option v-for="size in pageSizeOptions" :key="size" :value="size">
              {{ size }} 条
            </option>
          </select>
          <span class="page-info">
            共 {{ formatCount(totalUsers) }} 条记录，第 {{ formatCount(currentPage) }} / {{ formatCount(totalPages) }} 页
          </span>
        </div>
        
        <div class="pagination-right">
          <button 
            class="page-btn" 
            :disabled="currentPage === 1"
            @click="handlePageChange(1)"
            title="首页"
          >
            ««
          </button>
          <button 
            class="page-btn" 
            :disabled="currentPage === 1"
            @click="handlePageChange(currentPage - 1)"
            title="上一页"
          >
            «
          </button>
          
          <div class="page-numbers">
            <button
              v-for="(page, index) in pageNumbers"
              :key="index"
              class="page-number-btn"
              :class="{
                'active': page === currentPage,
                'ellipsis': page === '...'
              }"
              :disabled="page === '...'"
              @click="typeof page === 'number' && handlePageChange(page)"
            >
              {{ page }}
            </button>
          </div>
          
          <button 
            class="page-btn" 
            :disabled="currentPage >= totalPages"
            @click="handlePageChange(currentPage + 1)"
            title="下一页"
          >
            »
          </button>
          <button 
            class="page-btn" 
            :disabled="currentPage >= totalPages"
            @click="handlePageChange(totalPages)"
            title="末页"
          >
            »»
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.user-fund-container {
  padding: 24px;
  background-color: #f9fafb; /* Light background */
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1f2937;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
}

.page-title::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 24px;
  background-color: #2563eb;
  margin-right: 12px;
  border-radius: 2px;
}

.page-subtitle {
  color: #6b7280;
  font-size: 14px;
  margin: 0;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 360px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  font-size: 16px;
}

.search-input {
  flex: 1;
  padding: 10px 16px 10px 40px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background-color: #ffffff;
  color: #1f2937;
  font-size: 14px;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.search-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: none;
  background-color: #2563eb;
  color: #ffffff;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.2s, box-shadow 0.2s;
}

.search-btn:hover {
  background-color: #1d4ed8;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
}

/* Stats Section */
.stats-section {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  margin-bottom: 40px;
}

.stats-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e5e7eb;
  transition: transform 0.2s;
}

.stats-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

.stats-card.blue-theme {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: white;
  border: none;
}

.stats-card.blue-theme .stats-label,
.stats-card.blue-theme .stats-value {
  color: white;
}

.stats-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background-color: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stats-card.blue-theme .stats-icon {
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
}

.stats-content {
  flex: 1;
}

.stats-label {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 4px;
}

.stats-value {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
}

.green-text {
  color: #10b981;
}

.red-text {
  color: #ef4444;
}

/* User List Section */
.user-list-section {
  background: transparent;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  position: relative;
  z-index: 1000;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 20px;
}

.filter-sort-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  background: linear-gradient(135deg, #ffffff 0%, #f9fafb 100%);
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  z-index: 100;
}

.control-item:hover {
  background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
  border-color: #cbd5e1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.control-item:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.control-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s ease;
}

.control-item:hover .control-icon {
  transform: scale(1.1);
}

.control-icon svg {
  transition: all 0.3s ease;
}

.control-item:hover .filter-icon svg path {
  stroke-width: 3;
}

.control-item:hover .sort-icon svg path {
  stroke-width: 3;
}

.control-text {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  transition: color 0.3s ease;
}

.control-item:hover .control-text {
  color: #111827;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 160px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.08);
  z-index: 10;
  overflow: hidden;
  backdrop-filter: blur(10px);
}

/* 下拉菜单淡入淡出动画 */
.dropdown-fade-enter-active {
  animation: dropdown-fade-in 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.dropdown-fade-leave-active {
  animation: dropdown-fade-out 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes dropdown-fade-in {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes dropdown-fade-out {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-8px) scale(0.95);
  }
}

.dropdown-item {
  padding: 10px 16px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.dropdown-item:hover {
  background: #f3f4f6;
}

.dropdown-item.active {
  background: #eff6ff;
  color: #3b82f6;
  font-weight: 600;
}

.filter-options {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
}

/* 空状态样式 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  margin-top: 20px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.6;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.empty-title {
  font-size: 20px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
}

.empty-message {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 24px;
  line-height: 1.6;
}

.empty-message strong {
  color: #3b82f6;
  font-weight: 600;
}

.empty-tips {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px 20px;
  max-width: 500px;
  text-align: left;
}

.empty-tips p {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.empty-tips ul {
  margin: 0;
  padding-left: 20px;
  list-style: none;
}

.empty-tips li {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.8;
  margin-bottom: 6px;
  position: relative;
  padding-left: 20px;
}

.empty-tips li:before {
  content: "•";
  position: absolute;
  left: 0;
  color: #9ca3af;
}

.clear-search-btn {
  display: inline-block;
  margin-top: 12px;
  padding: 6px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-search-btn:hover {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.user-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.user-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e5e7eb;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

/* Hover Effect: Float & Shadow */
.user-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 20px -8px rgba(0, 0, 0, 0.1);
  border-color: #bfdbfe;
}

/* 底部滑动条 - 科技感效果 */
.card-slide-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    #3b82f6 0%,
    #8b5cf6 25%,
    #ec4899 50%,
    #f59e0b 75%,
    #10b981 100%
  );
  opacity: 0;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.5),
              0 0 20px rgba(139, 92, 246, 0.3),
              0 0 30px rgba(236, 72, 153, 0.2);
  z-index: 1;
}

.user-card:hover .card-slide-bar {
  width: 100%;
  opacity: 1;
  animation: slideBarGlow 2s ease-in-out infinite,
             slideBarShimmer 1.5s ease-in-out infinite;
}

/* 发光脉冲效果 */
@keyframes slideBarGlow {
  0%, 100% {
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.5),
                0 0 20px rgba(139, 92, 246, 0.3),
                0 0 30px rgba(236, 72, 153, 0.2);
  }
  50% {
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.8),
                0 0 40px rgba(139, 92, 246, 0.6),
                0 0 60px rgba(236, 72, 153, 0.4),
                0 0 80px rgba(245, 158, 11, 0.3);
  }
}

/* 渐变流动效果 */
@keyframes slideBarShimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.user-card:hover .card-slide-bar {
  background-size: 200% 100%;
  animation: slideBarShimmer 1.5s linear infinite,
             slideBarGlow 2s ease-in-out infinite;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.user-avatar-container {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background-color: #e5e7eb;
  flex-shrink: 0;
}

.user-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  color: #6b7280;
  background-color: #f3f4f6;
}

.user-info {
  flex: 1;
}

.user-name {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 2px;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 15px;
  color: #374151;
  margin-top: 6px;
  max-width: 250px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
  line-height: 1.5;
  padding: 2px 0;
}

.user-status {
  font-size: 12px;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #9ca3af;
}

.status-text {
  font-weight: 500;
}

/* 状态颜色：与圆点和文字共用 class，Active 为绿色 */
.status-dot.status-normal {
  background-color: #10b981;
}

.status-text.status-normal {
  color: #10b981;
}

.status-dot.status-banned {
  background-color: #ef4444;
}

.status-text.status-banned {
  color: #ef4444;
}

.status-dot.status-warning {
  background-color: #f59e0b;
}

.status-text.status-warning {
  color: #f59e0b;
}

.status-dot.status-unknown {
  background-color: #9ca3af;
}

.status-text.status-unknown {
  color: #6b7280;
}

.card-body {
  margin-bottom: 20px;
}

.balance-label {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 4px;
}

.balance-amount {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #6b7280;
  padding-top: 16px;
  border-top: 1px solid #f3f4f6;
  margin-bottom: 12px;
}

.card-tags {
  display: flex;
  gap: 8px;
}

.tag {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  transition: all 0.2s;
}

/* 高价值用户 - 金色渐变 */
.tag-high-value {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(251, 191, 36, 0.3);
}

.tag-high-value:hover {
  box-shadow: 0 4px 8px rgba(251, 191, 36, 0.4);
  transform: translateY(-1px);
}

/* VIP用户 - 紫色渐变 */
.tag-vip {
  background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%);
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(168, 85, 247, 0.3);
  position: relative;
}

.tag-vip::before {
  content: '✨';
  margin-right: 2px;
  font-size: 10px;
}

.tag-vip:hover {
  box-shadow: 0 4px 8px rgba(168, 85, 247, 0.4);
  transform: translateY(-1px);
}

/* 活跃用户 - 绿色 */
.tag-active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
}

.tag-active:hover {
  box-shadow: 0 4px 8px rgba(16, 185, 129, 0.4);
}

/* 余额预警 - 红色 */
.tag-low-balance {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
}

.tag-low-balance:hover {
  box-shadow: 0 4px 8px rgba(239, 68, 68, 0.4);
}

/* 新用户 - 蓝色 */
.tag-new {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
}

.tag-new:hover {
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.4);
}

/* 分页控件 */
.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 32px;
  padding: 20px 24px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  flex-wrap: wrap;
  gap: 16px;
}

.pagination-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pagination-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-size-label {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

.page-size-select {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background-color: #ffffff;
  color: #1f2937;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-size-select:hover {
  border-color: #2563eb;
}

.page-size-select:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.page-info {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
  white-space: nowrap;
}

.page-btn {
  min-width: 36px;
  height: 36px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background-color: #ffffff;
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-btn:hover:not(:disabled) {
  background-color: #f3f4f6;
  border-color: #2563eb;
  color: #2563eb;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-numbers {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-number-btn {
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background-color: #ffffff;
  color: #1f2937;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-number-btn:hover:not(:disabled):not(.ellipsis) {
  background-color: #f3f4f6;
  border-color: #2563eb;
  color: #2563eb;
}

.page-number-btn.active {
  background-color: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
  font-weight: 600;
}

.page-number-btn.ellipsis {
  border: none;
  background: transparent;
  cursor: default;
  color: #9ca3af;
}

.page-number-btn:disabled.ellipsis {
  opacity: 1;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .pagination-container {
    flex-direction: column;
    align-items: stretch;
  }
  
  .pagination-left,
  .pagination-right {
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .page-info {
    font-size: 12px;
  }
}
</style>
