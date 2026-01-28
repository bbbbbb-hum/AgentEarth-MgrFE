import { createRouter, createWebHistory, type RouteLocationNormalized, type NavigationGuardNext } from 'vue-router';
import ServiceEntry from '../views/ServiceEntry.vue';
import ServiceTest from '../views/ServiceTest.vue';
import ServiceOnline from '../views/ServiceOnline.vue';
import ServicePrice from '../views/ServicePrice.vue';
import UserFundManagement from '../views/UserFundManagement.vue';
import UserDetail from '../views/UserDetail.vue';
import Login from '../views/Login.vue';

const routes = [
  {
    path: '/',
    redirect: '/login'
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
    path: '/service-online',
    name: 'ServiceOnline',
    component: ServiceOnline,
    meta: { requiresAuth: true }
  },
  {
    path: '/service-price',
    name: 'ServicePrice',
    component: ServicePrice,
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
  const token = localStorage.getItem('token');
  
  // 如果访问根路径，直接跳转到登录页
  if (to.path === '/') {
    next('/login');
    return;
  }
  
  if (to.meta.requiresAuth && !token) {
    next('/login');
  } else if (to.path === '/login' && token) {
    next('/service-entry');
  } else {
    next();
  }
});

export default router;
