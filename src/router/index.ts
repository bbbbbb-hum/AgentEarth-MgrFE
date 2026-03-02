import { createRouter, createWebHistory, type RouteLocationNormalized, type NavigationGuardNext } from 'vue-router';
import { getToken, isTokenExpired, logout } from '../http';
import ServiceEntry from '../views/ServiceEntry.vue';
import ServiceTest from '../views/ServiceTest.vue';
import ServicePrice from '../views/ServicePrice.vue';
import McpServices from '../views/McpServices.vue';
import McpServiceDetail from '../views/McpServiceDetail.vue';
import UserFundManagement from '../views/UserFundManagement.vue';
import UserDetail from '../views/UserDetail.vue';
import Login from '../views/Login.vue';
import RuleCenter from '../views/RuleCenterV2.vue';

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/rules',
    name: 'RuleCenter',
    component: RuleCenter,
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/service-entry',
    name: 'ServiceEntry',
    component: ServiceEntry,
    meta: { requiresAuth: true }
  },
  {
    path: '/service-test',
    name: 'ServiceTest',
    component: ServiceTest,
    meta: { requiresAuth: true }
  },
  {
    path: '/service-price',
    name: 'ServicePrice',
    component: ServicePrice,
    meta: { requiresAuth: true }
  },
  {
    path: '/mcp-services',
    name: 'McpServices',
    component: McpServices,
    meta: { requiresAuth: true }
  },
  {
    path: '/mcp-services/:id',
    name: 'McpServiceDetail',
    component: McpServiceDetail,
    meta: { requiresAuth: true }
  },
  {
    path: '/user-fund',
    name: 'UserFundManagement',
    component: UserFundManagement,
    meta: { requiresAuth: true }
  },
  {
    path: '/user-fund/:user_id',
    name: 'UserDetail',
    component: UserDetail,
    meta: { requiresAuth: true }
  }
];

const router = createRouter({
  history: createWebHistory('/manager/'),
  routes
});

router.beforeEach((to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext) => {
  const token = getToken();
  const tokenValid = token && !isTokenExpired(token);
  
  // 如果访问根路径，直接跳转到登录页
  if (to.path === '/') {
    next('/login');
    return;
  }
  
  // 需要鉴权的页面
  if (to.meta.requiresAuth) {
    if (!tokenValid) {
      // token 不存在或已过期，清除本地存储并跳转登录页
      if (token) {
        // token 存在但已过期，执行登出清理
        logout();
        return; // logout 会跳转，不需要 next
      }
      next('/login');
    } else {
      next();
    }
  } else if (to.path === '/login' && tokenValid) {
    // 已登录且 token 有效，访问登录页时跳转到首页
    next('/service-entry');
  } else {
    next();
  }
});

export default router;
