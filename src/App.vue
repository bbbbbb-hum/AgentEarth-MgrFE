<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const sidebarOpen = ref(true);

// 判断菜单项是否激活
const isActiveMenu = (path: string) => {
  return route.path === path;
};

// 标签页相关状态
interface Tab {
  id: number;
  title: string;
  path: string;
  closable: boolean;
  serviceName?: string; // 新增服务名称字段，用于详情页
}

const tabs = ref<Tab[]>([
  { id: 1, title: '外部MCP服务录入', path: '/service-entry', closable: true }
]);
const activeTab = ref('/service-entry');

// 当前页面标题
const currentPageTitle = ref('外部MCP服务录入');

// 检查是否是详情页路由（带参数的路由）
const isDetailRoute = (path: string, basePath: string): boolean => {
  // 如果路径以基础路径开头，且长度更长，说明是详情页
  return path.startsWith(basePath + '/') && path !== basePath;
};

// 获取基础路径（不带参数）
const getBasePath = (path: string): string => {
  const parts = path.split('/');
  // 如果路径有3个或更多部分（如 /user-fund/:id），则返回前两部分
  if (parts.length >= 3) {
    return `/${parts[1]}`;
  }
  return path;
};

// 添加标签页
const addTab = (path: string, title: string) => {
  const basePath = getBasePath(path);
  // const isDetail = isDetailRoute(path, basePath); // 不再需要单独判断是否为详情页来决定复用逻辑
  
  // 查找是否存在同一模块（相同basePath）的标签页
  // 无论是详情页还是列表页，只要属于同一个模块，就复用同一个标签页
  const existingTab = tabs.value.find(tab => getBasePath(tab.path) === basePath);
  
  if (existingTab) {
    // 复用现有标签页，更新路径和标题
    existingTab.path = path;
    existingTab.title = title;
    
    // 如果回到了列表页（路径等于基础路径），清除之前详情页可能设置的服务名称
    if (path === basePath) {
      existingTab.serviceName = undefined;
    }
    
    activeTab.value = path;
    return;
  }
  
  // 如果标签页不存在，创建新标签页
  tabs.value.push({
    id: Date.now(),
    title,
    path,
    closable: true
  });
  activeTab.value = path;
};

// 关闭标签页
const closeTab = (path: string) => {
  // 如果是最后一个标签页，不允许关闭
  if (tabs.value.length <= 1) return;
  
  const index = tabs.value.findIndex(tab => tab.path === path);
  if (index > -1) {
    const isClosingActiveTab = activeTab.value === path;
    
    // 删除标签页
    tabs.value.splice(index, 1);
    
    // 如果关闭的是当前激活的标签页，切换到前一个标签页并跳转路由
    if (isClosingActiveTab) {
      // 优先选择前一个标签页，如果没有则选择后一个，都没有则选择第一个
      let targetTab: Tab | null = null;
      
      if (index > 0) {
        // 选择前一个标签页
        targetTab = tabs.value[index - 1];
      } else if (tabs.value.length > 0) {
        // 选择第一个标签页（因为关闭的是第一个）
        targetTab = tabs.value[0];
      }
      
      if (targetTab) {
        activeTab.value = targetTab.path;
        // 实际跳转到目标标签页的路由
        router.replace(targetTab.path);
      }
    }
  }
};

// 更新标签页服务名称
const updateTabServiceName = (path: string, serviceName: string) => {
  const tab = tabs.value.find(tab => tab.path === path);
  if (tab) {
    tab.serviceName = serviceName;
    tab.title = serviceName;
    // 如果是当前激活的标签页，也更新页面标题
    if (tab.path === activeTab.value) {
      currentPageTitle.value = serviceName;
    }
  }
};

// 侧边栏菜单项接口
interface SidebarMenuItem {
  id: number;
  title: string;
  path: string;
  icon: string;
  children?: {
    id: number;
    title: string;
    path: string;
    icon?: string;
  }[];
}

// 侧边栏菜单配置
const sidebarMenu = ref<SidebarMenuItem[]>([
  // {
  //   id: 1,
  //   title: '首页',
  //   path: '/',
  //   icon: '📊'
  // },
  {
    id: 2,
    title: '外部MCP服务录入',
    path: '/service-entry',
    icon: '🖥️'
  },
  {
    id: 3,
    title: '外部MCP服务测试',
    path: '/service-test',
    icon: '🔧'
  },
  {
    id: 4,
    title: '外部MCP服务上线状态管理',
    path: '/service-online',
    icon: '🔄'
  },
  {
    id: 6,
    title: '星量MCP服务价格管理',
    path: '/service-price',
    icon: '💰'
  },
  {
    id: 7,
    title: '星量用户资金管理',
    path: '/user-fund',
    icon: '💎'
  }
  // {
  //   id: 3,
  //   title: '源数据',
  //   path: '/data-sources',
  //   icon: '🗄️',
  //   children: [
  //     {
  //       id: 31,
  //       title: '外部服务',
  //       path: '/data-sources'
  //     },
  //     {
  //       id: 32,
  //       title: '账号列表',
  //       path: '/accounts'
  //     }
  //   ]
  // },
  // {
  //   id: 4,
  //   title: 'MCP服务',
  //   path: '/mcp-services',
  //   icon: '🖥️',
  //   children: [
  //     {
  //       id: 41,
  //       title: '服务列表',
  //       path: '/mcp-services'
  //     },
  //     {
  //       id: 42,
  //       title: '服务信息录入',
  //       path: '/service-entry'
  //     },
  //     {
  //       id: 43,
  //       title: '安装列表',
  //       path: '/install-list'
  //     },
  //     {
  //       id: 44,
  //       title: '配置账号列表',
  //       path: '/mcp-service-config-accounts'
  //     }
  //   ]
  // }
]);

// 切换标签页
const switchTab = (path: string) => {
  activeTab.value = path;
  router.push(path);
};

// 监听路由变化，自动添加标签页
watch(
  () => route.path,
  (newPath, oldPath) => {
    // 不处理路由切换过程中的变化
    if (!newPath) return;
    
    // 不处理登录页面的路由变化
    if (newPath === '/login' || oldPath === '/login') {
      return;
    }
    
    // 如果新路径和旧路径相同，不处理（避免重复创建标签页）
    if (newPath === oldPath) {
      // 即使路径相同，也要确保 activeTab 正确设置
      const existingTab = tabs.value.find(tab => tab.path === newPath);
      if (existingTab) {
        activeTab.value = newPath;
      }
      return;
    }
    
    // 查找当前路由对应的菜单标题
    let currentTitle = '未知页面';
    
    // 先搜索所有子菜单
    for (const menu of sidebarMenu.value) {
      if (menu.children) {
        // 先尝试精确匹配
        const exactSubMenu = menu.children.find(item => item.path === newPath);
        if (exactSubMenu) {
          currentTitle = exactSubMenu.title;
          break;
        }
        
        // 尝试基础路径匹配（用于处理带参数的路由）
        const basePath = getBasePath(newPath);
        const baseSubMenu = menu.children.find(item => item.path === basePath);
        if (baseSubMenu) {
          // 详情页使用基础标题，不添加"- 详情"后缀
          currentTitle = baseSubMenu.title;
          break;
        }
      }
    }
    
    // 如果没有找到子菜单匹配项，再搜索主菜单
    if (currentTitle === '未知页面') {
      // 先尝试精确匹配
      const exactMainMenu = sidebarMenu.value.find(menu => menu.path === newPath);
      if (exactMainMenu) {
        currentTitle = exactMainMenu.title;
      } else {
        // 尝试基础路径匹配（用于处理带参数的路由）
        const basePath = getBasePath(newPath);
        const baseMainMenu = sidebarMenu.value.find(menu => menu.path === basePath);
        if (baseMainMenu) {
          // 详情页使用基础标题，不添加"- 详情"后缀
          currentTitle = baseMainMenu.title;
        }
      }
    }
      
    // 检查是否已有该路径的标签页，如果有且有服务名称，使用服务名称
    const existingTab = tabs.value.find(tab => tab.path === newPath);
    if (existingTab?.serviceName) {
      currentTitle = existingTab.serviceName;
    }
    
    // 更新当前页面标题
    currentPageTitle.value = currentTitle;
    
    // 添加标签页
    addTab(newPath, currentTitle);
  }
);

// 监听组件挂载事件
onMounted(() => {
  // 添加事件监听，用于接收详情页发送的服务名称
  window.addEventListener('update-tab-service-name', (event: Event) => {
    const customEvent = event as CustomEvent<{ path: string; serviceName: string }>;
    updateTabServiceName(customEvent.detail.path, customEvent.detail.serviceName);
  });
});
</script>

<template>
  <div class="admin-container">
    <!-- 登录页面独立显示 -->
    <div v-if="route.path === '/login'" class="login-page-container">
      <router-view />
    </div>
    
    <!-- 其他页面显示侧边栏和主内容 -->
    <template v-else>
      <!-- 侧边栏 -->
      <aside :class="['sidebar', { 'sidebar-collapsed': !sidebarOpen }]">
        <!-- 侧边栏头部 -->
        <div class="sidebar-header">
          <div v-if="sidebarOpen" class="logo">
            <h1>星量智网</h1>
          </div>
          <button class="sidebar-toggle" @click="sidebarOpen = !sidebarOpen">
            {{ sidebarOpen ? '◀️' : '▶️' }}
          </button>
        </div>
        
        <!-- 侧边栏菜单 -->
        <nav class="sidebar-menu">
          <ul>
            <li 
              v-for="item in sidebarMenu" 
              :key="item.id"
              :class="['menu-item', { 'menu-item-active': isActiveMenu(item.path) }]"
            >
              <router-link :to="item.path" class="menu-link">
                <span class="menu-icon">{{ item.icon }}</span>
                <span v-if="sidebarOpen" class="menu-title">{{ item.title }}</span>
              </router-link>
              
              <!-- 子菜单 -->
              <ul v-if="item.children && sidebarOpen" class="submenu">
                <li v-for="subitem in item.children" :key="subitem.id" :class="['submenu-item', { 'submenu-item-active': isActiveMenu(subitem.path) }]">
                  <router-link :to="subitem.path" class="submenu-link">
                    <span class="submenu-icon">{{ subitem.icon }}</span>
                    <span class="submenu-title">{{ subitem.title }}</span>
                  </router-link>
                </li>
              </ul>
            </li>
          </ul>
        </nav>
      </aside>

      <!-- 主内容区域 -->
      <main class="main-content">
        <!-- 顶部导航栏 -->
        <div class="top-navbar">
        </div>
        
        <!-- 标签页栏 -->
        <div class="tabs-bar">
          <div 
            v-for="tab in tabs" 
            :key="tab.id"
            :class="['tab-item', { 'tab-item-active': tab.path === activeTab }]"
            @click="switchTab(tab.path)"
          >
            <span class="tab-title">{{ tab.title }}</span>
            <button 
              v-if="tab.closable" 
              class="tab-close-btn"
              @click.stop="closeTab(tab.path)"
              title="关闭"
            >
              ×
            </button>
          </div>
        </div>
        
        <!-- 路由视图 - 使用keep-alive缓存组件状态 -->
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </main>
    </template>
  </div>
</template>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 统一表格列宽配置 */
:root {
  --table-col-checkbox-width: 40px;
  --table-col-service-name-width: 120px;
  --table-col-config-id-width: 70px;
  --table-col-auth-info-width: 10px;
  --table-col-status-width: 10px;
  --table-col-create-time-width: 80px;
  --table-col-update-time-width: 80px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background-color: #f5f7fa;
  color: #333;
  line-height: 1.6;
}

/* 管理后台容器 */
.admin-container {
  display: flex;
  min-height: 100vh;
  width: 100%;
}

/* 登录页面容器 */
.login-page-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 侧边栏样式 */
.sidebar {
  width: 260px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  color: #fff;
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
  box-shadow: 4px 0 12px rgba(0, 0, 0, 0.15);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar-collapsed {
  width: 70px;
}

.sidebar-collapsed .menu-link {
  justify-content: center;
  padding: 14px 0;
  margin-right: 0;
}

.sidebar-collapsed .menu-icon {
  margin-right: 0;
}

.sidebar-collapsed .submenu {
  display: none;
}

/* 当侧边栏折叠时，调整主内容区域宽度 */
.sidebar-collapsed + .main-content {
  width: calc(100vw - 70px);
}

/* 侧边栏头部 */
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
}

.sidebar-header .logo h1 {
  font-size: 1.4rem;
  margin: 0;
  font-weight: 700;
  background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 0.5px;
}

.sidebar-toggle {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  padding: 8px 10px;
  border-radius: 6px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.sidebar-toggle:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

/* 侧边栏菜单 */
.sidebar-menu {
  flex: 1;
  padding: 12px 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-menu ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.menu-item {
  margin-bottom: 4px;
  position: relative;
}

.menu-link {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0 8px 8px 0;
  margin-right: 12px;
  position: relative;
  font-weight: 500;
  font-size: 0.95rem;
}

.menu-link::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%);
  border-radius: 0 2px 2px 0;
  transition: height 0.3s ease;
}

.menu-item:hover .menu-link {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  transform: translateX(4px);
}

.menu-item:hover .menu-link::before {
  height: 60%;
}

.menu-item-active .menu-link,
.menu-item.active .menu-link {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.1) 100%);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
}

.menu-item-active .menu-link::before,
.menu-item.active .menu-link::before {
  height: 70%;
  box-shadow: 0 0 8px rgba(96, 165, 250, 0.6);
}

.submenu-item-active, .submenu-item.active {
  background-color: rgba(52, 152, 219, 0.1);
  border-left: 3px solid #3498db;
}

.menu-icon {
  font-size: 1.3rem;
  margin-right: 12px;
  width: 24px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s ease;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.menu-item:hover .menu-icon {
  transform: scale(1.15);
}

.menu-item-active .menu-icon,
.menu-item.active .menu-icon {
  transform: scale(1.2);
  filter: drop-shadow(0 0 8px rgba(96, 165, 250, 0.6));
}

.menu-title {
  font-size: 0.95rem;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 子菜单 */
.submenu {
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 0 8px 20px;
  margin-top: 4px;
  border-left: 2px solid rgba(255, 255, 255, 0.1);
  margin-left: 20px;
  border-radius: 0 0 0 8px;
}

.submenu-item {
  margin: 2px 0;
}

.submenu-link {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  font-size: 0.875rem;
  transition: all 0.3s ease;
  border-radius: 6px;
  margin-right: 12px;
  position: relative;
}

.submenu-link::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 0;
  background: linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%);
  border-radius: 0 2px 2px 0;
  transition: height 0.3s ease;
}

.submenu-link:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  transform: translateX(4px);
}

.submenu-link:hover::before {
  height: 50%;
}

.submenu-item-active .submenu-link,
.submenu-item.active .submenu-link {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  font-weight: 600;
}

.submenu-item-active .submenu-link::before,
.submenu-item.active .submenu-link::before {
  height: 60%;
  box-shadow: 0 0 6px rgba(96, 165, 250, 0.5);
}

.submenu-icon {
  font-size: 1rem;
  margin-right: 10px;
  width: 18px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s ease;
}

.submenu-link:hover .submenu-icon {
  transform: scale(1.1);
}

/* 主内容区域 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #f5f7fa;
  overflow-x: auto; /* 允许横向滚动 */
  overflow-y: auto; /* 允许垂直滚动 */
  transition: width 0.3s ease; /* 与侧边栏折叠动画同步 */
}

/* 顶部导航栏 */
.top-navbar {
  background-color: #fff;
  padding: 0 30px;
  height: 80px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 10;
  width: 100%;
  min-width: 100%;
}

.navbar-left h2 {
  font-size: 1.5rem;
  color: #2c3e50;
}

.navbar-right {
  display: flex;
  align-items: center;
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.action-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  position: relative;
  padding: 5px;
}

.badge {
  position: absolute;
  top: 0;
  right: 0;
  background-color: #e74c3c;
  color: #fff;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.user-avatar {
  font-size: 1.5rem;
}

.user-name {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

/* 标签页栏 */
.tabs-bar {
  background-color: #fff;
  border-bottom: 1px solid #e0e6ed;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden; /* 禁止垂直滚动条 */
  height: 40px;
  line-height: 40px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  z-index: 5;
  flex-shrink: 0;
  width: 100%;
  min-width: 100%;
}

/* 标签项 */
.tab-item {
  display: flex;
  align-items: center;
  padding: 0 16px;
  background-color: #f5f7fa;
  color: #606266;
  cursor: pointer;
  border-right: 1px solid #e0e6ed;
  transition: all 0.3s ease;
  white-space: nowrap;
  height: 100%;
}

.tab-item:hover {
  background-color: #ecf5ff;
  color: #409eff;
}

/* 激活的标签项 */
.tab-item-active {
  background-color: #fff;
  color: #409eff;
  border-top: 2px solid #409eff;
  border-bottom: none;
  box-shadow: 0 -2px 0 #409eff inset;
}

/* 标签标题 */
.tab-title {
  font-size: 14px;
  margin-right: 8px;
}

/* 标签关闭按钮 */
.tab-close-btn {
  background: none;
  border: none;
  color: inherit;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.tab-close-btn:hover {
  background-color: rgba(0, 0, 0, 0.1);
  color: #f56c6c;
}

/* 路由视图容器 */
router-view {
  flex: 1;
  overflow: auto; /* 允许内容溢出时显示滚动条 */
  padding: 0;
  width: 100%;
}

/* 确保页面内容可横向滚动，滚动条显示在浏览器底部 */
html {
  overflow-x: auto;
  overflow-y: auto;
  scrollbar-width: thin;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  overflow-x: auto;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

#app {
  width: 100%;
  height: 100vh;
  overflow: auto;
  display: flex;
}

/* 自定义滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* 确保表格容器不会限制横向滚动 */
.table-wrapper {
  overflow-x: auto !important;
  margin-bottom: 10px;
}

.data-table {
  width: auto;
  border-collapse: collapse;
  background-color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  white-space: nowrap;
  min-width: 100%;
}

/* 确保所有表格容器都允许内容溢出 */
.table-section {
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  overflow: auto;
}

.table-card {
  padding: 20px;
  overflow: visible;
}

/* 面包屑导航 */
.breadcrumb {
  padding: 15px 30px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #e0e6ed;
  font-size: 0.9rem;
  color: #7f8c8d;
}

.breadcrumb .active {
  color: #3498db;
  font-weight: 500;
}

/* 内容区域 */
.content {
  flex: 1;
  padding: 0;
  overflow: auto; /* 允许内容溢出时显示滚动条 */
}

/* 数据卡片区域 */
.data-cards-section {
  padding: 10px;
}

.data-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.data-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.data-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.card-title {
  font-size: 0.9rem;
  color: #7f8c8d;
  margin: 0;
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}

.card-body {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.card-value {
  font-size: 1.8rem;
  font-weight: 600;
  color: #2c3e50;
}

.card-change {
  font-size: 0.8rem;
  font-weight: 500;
}

.card-change.up {
  color: #2ecc71;
}

.card-change.down {
  color: #e74c3c;
}

.card-change.stable {
  color: #95a5a6;
}

/* 图表区域 */
.charts-section {
  padding: 10px;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
}

.chart-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.chart-header h3 {
  font-size: 1rem;
  color: #2c3e50;
  margin: 0;
}

.chart-controls {
  display: flex;
  gap: 10px;
}

.control-btn {
  padding: 5px 15px;
  border: 1px solid #e0e6ed;
  background-color: #f5f7fa;
  border-radius: 5px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.control-btn.active {
  background-color: #3498db;
  color: #fff;
  border-color: #3498db;
}

.chart-placeholder {
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f7fa;
  border-radius: 5px;
}

.chart-skeleton {
  width: 90%;
  height: 80%;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}

.chart-line {
  width: 100%;
  height: 3px;
  background-color: #bdc3c7;
  border-radius: 2px;
  opacity: 0.5;
}

.chart-pie-skeleton {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pie-chart {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background-color: #bdc3c7;
  opacity: 0.5;
}

/* 数据列表区域 */
.data-list-section {
  padding: 10px;
}

.data-list-card {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.data-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.data-list-header h3 {
  font-size: 1rem;
  color: #2c3e50;
  margin: 0;
}

.btn {
  padding: 8px 20px;
  border: none;
  border-radius: 5px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background-color: #3498db;
  color: #fff;
}

.btn-primary:hover {
  background-color: #2980b9;
}

/* 表格样式 */
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e0e6ed;
}

.table th {
  background-color: #f5f7fa;
  font-weight: 600;
  color: #2c3e50;
  font-size: 0.9rem;
}

.table td {
  color: #555;
  font-size: 0.9rem;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.status-badge.success {
  background-color: #d4edda;
  color: #155724;
}

.status-badge.warning {
  background-color: #fff3cd;
  color: #856404;
}

.status-badge.info {
  background-color: #d1ecf1;
  color: #0c5460;
}

.status-badge.error {
  background-color: #f8d7da;
  color: #721c24;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .top-navbar {
    padding: 0 15px;
  }
  
  .navbar-left h2 {
    font-size: 1rem;
  }
  
  .data-cards-grid {
    grid-template-columns: 1fr;
  }
  
  .data-cards-section,
  .charts-section,
  .data-list-section {
    padding: 0 15px 15px;
  }
  
  .breadcrumb {
    padding: 15px;
  }
}
</style>