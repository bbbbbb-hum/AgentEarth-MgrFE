<!--
  文件名称: UserDetail.vue
  功能说明: 星量用户资金管理 - 用户详情页
  创建时间: 2026-01-24
  
  核心功能模块:
  
  【Top 区域 - 用户画像 & AI资金洞察】
  - 左侧: 用户基础信息卡片（头像、ID、注册时间、标签）
  - 右侧: AI资金洞察卡片（深色主题，科技感十足）
    * 当前可用余额（带CountUp滚动动画）
    * 资金续航预估 (Runway = 余额 / 日均消费)
    * 续航进度条（渐变色健康度）
    * 日均消费展示
    * 人工充值按钮
  
  【Middle 区域 - 数据可视化图表】
  - 左图: 余额趋势分析（ECharts面积曲线图）
    * 支持7天/30天视图切换
    * 页面加载时自动滑动到最新一天
    * 数据来源: ae_user_balance_statistic_daily
  
  - 右图: 用户消费统计（ECharts堆叠柱状图）
    * 绿色柱: 自行消费（xlcredit_consume > 0）
    * 红色柱: 系统扣减（xlcredit_consume < 0）
    * 数据来源: ae_user_consumption_record_daily
  
  【Bottom 区域 - 资金变动明细】
  - 完整交易记录表格
  - Tab筛选: 全部 / 仅充值 / 仅扣减
  - 交易类型图标: 充值💳(绿色) / 扣减⚠️(红色)
  - 金额颜色语义化: 充值(+绿色) / 扣减(-红色)
  - 数据来源: ae_user_recharge_record
  
  【人工充值流程】
  - Step 1: 输入金额弹窗（支持快捷金额+100/+500/+1000/+5000）
  - Step 2: 二次确认弹窗（Danger警告样式）
  - Step 3: 充值成功Toast提示（左下角，3秒后自动消失）
  
  技术栈:
  - Vue 3 Composition API + TypeScript
  - ECharts 5.x (图表库)
  - CSS3 动画（余额滚动、曲线滑动）
  - Vue Router (路由管理)
  
  炫酷特效:
  - ⚡ 余额数字滚动动画（2秒CountUp）
  - 🎢 曲线图进入时动态滑动到最新一天
  - 🎨 深色AI洞察卡片（渐变背景）
  - 📊 ECharts图表平滑动画
  - 🎯 所有按钮和卡片平滑过渡
-->

<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as echarts from 'echarts';
import * as XLSX from 'xlsx';

const route = useRoute();
const router = useRouter();
// 使用计算属性动态获取路由参数，这样当路由参数变化时会自动更新
const userId = computed(() => route.params.user_id as string);
const apiBaseUrl = import.meta.env.BASE_URL;
const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// 接口定义
interface UserDetail {
  user: {
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
  };
  current_balance: number;
  daily_consumption: number;
  fund_runway: number;
}

interface ConsumptionRecord {
  day: string;
  self_consume: number;
  system_deduct: number;
}

interface BalanceHistory {
  day: string;
  balance: number;
}

interface FundChangeRecord {
  transaction_time: string;
  type_description: string;
  change_amount: number;
  status: string;
  remarks: string;
  charge_type: number;
  charge_type_desc: string;
  operator: string;
  // 仅充值时：批次剩余额度、过期时间、状态
  batch_id?: number;
  initial_amount?: number;
  remaining_amount?: number;
  remaining_at_expire?: number; // 已过期时：过期那一刻的剩余金额（用于进度条展示「过期时还剩多少」）
  expire_time?: string;
  batch_status?: string;
}

// 批次剩余额度展示辅助：
// - 后端 remaining_amount 保持真实值（可为负，表示透支）
// - 无快照 / 有快照对 totalBalance 一致，这里从 fundChangeRecords 全量视角重算“展示用余额”
// - 如果全局余额 >= 0：在展示层做一次“虚拟调账”，用新批次填补老批次的透支，
//   让老批次展示为 0，新批次展示为逻辑上的“真实可用余额”
// - 如果全局余额 < 0：保留原始透支展示（负余额 + 透支标签）
const getRemainingDisplay = (record: FundChangeRecord) => {
  const init = record.initial_amount ?? 0; // ??表示如果左边是null 或 undefined，就用右边的值
  const rawRemain = record.remaining_amount ?? 0; // 后端计算出来的真实剩余额度，可以为负数表示透支

  // 没有批次信息或初始金额 <= 0 时，直接按当前批次展示（防御性处理）
  if (!record.batch_id || init <= 0) {
    const displayRemainRaw = Math.max(rawRemain, 0);
    const overdraftRaw = rawRemain < 0 ? -rawRemain : 0; //如果真实余额为-50，就加负号展示为50
    const rawPct = init > 0 ? (displayRemainRaw / init) * 100 : 0;
    const percentText = formatPercent(rawPct, displayRemainRaw);
    return { displayRemain: displayRemainRaw, overdraft: overdraftRaw, percent: rawPct, percentText };
  }

  // 收集所有充值批次（仅 initial_amount > 0）
  const batches = fundChangeRecords.value.filter(r => r.initial_amount != null && r.initial_amount > 0);

  // 工具函数：解析过期时间字符串（YYYY-MM-DD 或 "永久有效"）
  const parseExpire = (expire?: string): Date | null => {
    if (!expire || expire === '永久有效') return null;
    const d = new Date(expire);
    return isNaN(d.getTime()) ? null : d;
  };

  // 工具函数：解析交易时间（"2026-02-08 00:00:00"）
  const parsePayTime = (timeStr: string): Date | null => {
    if (!timeStr) return null;
    // 替换空格为 T，避免部分环境下解析失败
    const d = new Date(timeStr.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  };

  const items = batches.map(b => ({
    id: b.batch_id as number,
    remain: b.remaining_amount ?? 0,
    initial: b.initial_amount as number,
    expire: parseExpire(b.expire_time),
    payTime: parsePayTime(b.transaction_time),
  }));

  // 全局真实余额 = 所有批次实时余额之和
  const totalReal = items.reduce((sum, b) => sum + b.remain, 0);

  // 如果全局余额仍为负数：保留原始透支展示（不做虚拟调账）
  if (totalReal < 0) {
    const displayRemainRaw = Math.max(rawRemain, 0);
    const overdraftRaw = rawRemain < 0 ? -rawRemain : 0;
    const rawPct = init > 0 ? (displayRemainRaw / init) * 100 : 0;
    const percentText = formatPercent(rawPct, displayRemainRaw);
    return { displayRemain: displayRemainRaw, overdraft: overdraftRaw, percent: rawPct, percentText };
  }

  // 全局余额 >= 0：在展示层进行“虚拟填补透支”
  // 1. 计算总透支债务
  let debt = items
    .filter(b => b.remain < 0) //把所有余额为负的批次挑出来，表示这些批次存在透支
    .reduce((sum, b) => sum + (-b.remain), 0); //对于每个负批次，把-b.remain加起来，得到总透支债务

  // 2. 正余额批次按「充值时间优先」填补透支：
  //    业务含义：谁先充值谁先扛历史窟窿，后来的充值只服务后续消费，不再重分配之前已经确定的填补结果。
  const positives = items
    .filter(b => b.remain > 0)
    .sort((a, b) => {
      // 先按支付时间升序：老充值在前，新充值在后，保证填补责任不会在后续充值到来时被“抢走”
      const pa = a.payTime ? a.payTime.getTime() : Number.POSITIVE_INFINITY;
      const pb = b.payTime ? b.payTime.getTime() : Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;

      // 支付时间相同再按过期时间升序：有过期时间的在前，永久有效在后（仅作为次级排序保证稳定性）
      const ea = a.expire ? a.expire.getTime() : Number.POSITIVE_INFINITY;
      const eb = b.expire ? b.expire.getTime() : Number.POSITIVE_INFINITY;
      if (ea !== eb) return ea - eb;

      // 再退一步，用 batch id 升序稳定排序
      return a.id - b.id;
    });

  const virtualMap: Record<number, number> = {}; //key是批次id，value是展示用剩余额度

  // 负余额批次：展示为 0（透支已被全局新充值填补）
  items
    .filter(b => b.remain <= 0) //把所有余额为0或负的批次挑出来，表示这些批次存在透支
    .forEach(b => { 
      virtualMap[b.id] = 0; //对于每个透支批次，展示用剩余额度为0
    });

  // 正余额批次：按顺序用自身余额去填补“历史欠账”
  for (const b of positives) { //遍历每一个正余额批次b
    if (debt <= 0) { //如果总透支债务为0，则直接用当前批次余额作为展示用剩余额度
      virtualMap[b.id] = b.remain;
      continue;
    }
    const use = Math.min(b.remain, debt); //用当前批次余额和总透支债务中的较小值作为填补金额，够扣就扣掉债务，不够扣就全扣
    virtualMap[b.id] = b.remain - use;
    debt -= use;
  }

  const virtualRemain = virtualMap[record.batch_id] ?? rawRemain;
  const displayRemain = Math.max(virtualRemain, 0);
  const rawPct = init > 0 ? (displayRemain / init) * 100 : 0;
  const percentText = formatPercent(rawPct, displayRemain);

  // 全局余额已经为非负，说明透支已被新充值整体填平：不再按批次展示透支标签
  return { displayRemain, overdraft: 0, percent: rawPct, percentText };
};

// 余额百分比展示：小于 1% 时保留一位小数，避免 0.58/220.58 等显示成 0%
const formatPercent = (rawPercent: number, displayRemain: number): string => {
  if (rawPercent <= 0 && displayRemain <= 0) return '0%';
  if (rawPercent > 0 && rawPercent < 1) return rawPercent.toFixed(1) + '%';
  return Math.round(rawPercent) + '%';
};

// 批次状态展示辅助：
// - 后端 batch_status 反映物理账本状态
// - 当前端做了“虚拟填补透支”后，如果展示用剩余额度为 0，则将状态统一展示为“已耗尽”
// - “已过期”状态始终优先，不受虚拟填补影响
const getBatchStatusDisplay = (record: FundChangeRecord): string => {
  if (!record.batch_status) return '';
  // 已过期：直接使用后端状态
  if (record.batch_status === '已过期') return record.batch_status;
  // 非充值批次或无初始金额：保持后端原始状态
  if (!record.batch_id || !record.initial_amount || record.initial_amount <= 0) {
    return record.batch_status;
  }
  const { displayRemain } = getRemainingDisplay(record);
  if (displayRemain <= 0) {
    return '已耗尽';
  }
  return '使用中';
};

const getBatchStatusClass = (record: FundChangeRecord): string => {
  const status = getBatchStatusDisplay(record);
  if (status === '使用中') return 'batch-status-active';
  if (status === '已耗尽') return 'batch-status-exhausted';
  if (status === '已过期') return 'batch-status-expired';
  return '';
};

// 状态
const loading = ref(true);
const userDetail = ref<UserDetail | null>(null);
const consumptionRecords = ref<ConsumptionRecord[]>([]);
const balanceHistory = ref<BalanceHistory[]>([]);
const fundChangeRecords = ref<FundChangeRecord[]>([]);
const selectedDays = ref(7); // 7 或 30
const recordFilter = ref('all'); // all, recharge, deduction
const chargeTypeFilter = ref(0); // 0=全部, 1=常规, 2=补偿, 3=赠送
const recordPage = ref(1);
const recordPageSize = ref(10);
const recordPageSizeOptions = [10, 20, 50, 100];
const recordPageInput = ref(1);
/** 资金变动总条数（来自接口，用于服务端分页） */
const recordTotalFromServer = ref(0);
const lineChart = shallowRef<echarts.ECharts | null>(null);
const barChart = shallowRef<echarts.ECharts | null>(null);
const isChartInitialized = ref(false); // 标记图表是否已初始化
const showRechargeModal = ref(false);
const showConfirmModal = ref(false);
const rechargeAmount = ref(0);
const rechargeRemarks = ref('');
const rechargeChargeType = ref(1);
const rechargeExpireEnabled = ref(false);
const rechargeExpireDate = ref(''); // YYYY-MM-DD，指定过期时间
const showExpireDatePicker = ref(false);
const expirePickerViewDate = ref<Date>(new Date()); // 日历当前展示的月份
const minExpireDate = (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
})();
const showDeductionModal = ref(false);
const showDeductionConfirmModal = ref(false);
const deductionAmount = ref(0);
const deductionRemarks = ref('');
const deductionChargeType = ref(5);
const showSuccessToast = ref(false);
const successTitle = ref('操作成功');
const successMessage = ref('');
const showCopyToast = ref(false);
const copyToastMessage = ref('');

const showRemarksDetailModal = ref(false);
const currentRemarks = ref('');

// 显示备注详情
const showRemarksModal = (remarks: string) => {
  currentRemarks.value = remarks;
  showRemarksDetailModal.value = true;
};

// 关闭备注详情
const closeRemarksModal = () => {
  showRemarksDetailModal.value = false;
  currentRemarks.value = '';
};

// 余额滚动动画
const displayBalance = ref(0);
const targetBalance = ref(0);
const isBalanceAnimating = ref(false);

const totalRecordCount = computed(() => recordTotalFromServer.value);
const totalRecordPages = computed(() => Math.max(1, Math.ceil(totalRecordCount.value / recordPageSize.value)));
const recordPageStart = computed(() => {
  if (totalRecordCount.value === 0) return 0;
  return (recordPage.value - 1) * recordPageSize.value + 1;
});
const recordPageEnd = computed(() => Math.min(totalRecordCount.value, recordPage.value * recordPageSize.value));
/** 当前页展示列表（接口已按页返回，无需再 slice） */
const pagedFundChangeRecords = computed(() => fundChangeRecords.value);

const clampRecordPage = (page: number) => {
  return Math.min(Math.max(1, page), totalRecordPages.value);
};

const resetRecordPaging = () => {
  recordPage.value = 1;
  recordPageInput.value = 1;
};

const setSuccessToast = (title: string, message: string, durationMs = 3000) => {
  successTitle.value = title;
  successMessage.value = message;
  showSuccessToast.value = true;
  setTimeout(() => {
    showSuccessToast.value = false;
  }, durationMs);
};

const goToRecordPage = (page: number) => {
  recordPage.value = clampRecordPage(page);
  recordPageInput.value = recordPage.value;
  fetchFundChangeRecords();
};

const changeRecordPageSize = (size: number) => {
  recordPageSize.value = size;
  resetRecordPaging();
  fetchFundChangeRecords();
};

const jumpToRecordPage = () => {
  if (!recordPageInput.value) {
    recordPageInput.value = recordPage.value;
    return;
  }
  goToRecordPage(recordPageInput.value);
};

// 获取用户详情
const fetchUserDetail = async (skipAnimation: boolean = false) => {
  try {
    const response = await fetch(`${apiBaseUrl}api/userfund/user/${userId.value}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch user detail');
    const data: UserDetail = await response.json();
    userDetail.value = data;
    targetBalance.value = data.current_balance;
    
    // 如果不需要动画（比如充值后），直接更新显示值
    if (skipAnimation) {
      displayBalance.value = data.current_balance;
    } else {
      // 启动余额滚动动画（从0开始，首次加载）
      animateBalance();
    }
  } catch (error) {
    console.error('Error fetching user detail:', error);
  }
};

// 余额滚动动画：从当前余额滚动到目标余额
const animateBalance = (fromValue?: number, toValue?: number) => {
  if (isBalanceAnimating.value) return;
  isBalanceAnimating.value = true;
  
  // 如果提供了起始值，使用它；否则使用当前显示值；如果都没有，从0开始
  const startValue = fromValue !== undefined ? fromValue : (displayBalance.value || 0);
  const endValue = toValue !== undefined ? toValue : targetBalance.value;
  
  // 如果起始值和目标值相同，直接设置并返回
  if (startValue === endValue) {
    displayBalance.value = endValue;
    isBalanceAnimating.value = false;
    return;
  }
  
  displayBalance.value = startValue;
  const duration = 2000; // 2秒
  const steps = 60;
  const difference = endValue - startValue;
  const increment = difference / steps;
  let currentStep = 0;
  
  const timer = setInterval(() => {
    currentStep++;
    const newValue = startValue + increment * currentStep;
    displayBalance.value = currentStep >= steps ? endValue : newValue;
    
    if (currentStep >= steps) {
      displayBalance.value = endValue;
      clearInterval(timer);
      isBalanceAnimating.value = false;
    }
  }, duration / steps);
};

// 获取消费记录
const fetchConsumptionRecords = async () => {
  try {
    console.log(`Fetching consumption records for ${userId.value}, days: ${selectedDays.value}`);
    const url = `${apiBaseUrl}api/userfund/user/${userId.value}/consumption?days=${selectedDays.value}`;
    console.log('API URL:', url);
    const response = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    console.log('Response status:', response.status, response.statusText);
    if (!response.ok) {
      const text = await response.text();
      console.error('API Error Response:', text);
      throw new Error(`Failed to fetch consumption records: ${response.status} ${text}`);
    }
    const data: { list: ConsumptionRecord[] } = await response.json();
    console.log('Consumption records fetched:', data);
    consumptionRecords.value = data.list || [];
    console.log('Consumption records count:', consumptionRecords.value.length);
  } catch (error) {
    console.error('Error fetching consumption records:', error);
    consumptionRecords.value = [];
  }
};

// 获取余额历史
const fetchBalanceHistory = async () => {
  try {
    console.log(`Fetching balance history for ${userId.value}, days: ${selectedDays.value}`);
    const url = `${apiBaseUrl}api/userfund/user/${userId.value}/balance?days=${selectedDays.value}`;
    console.log('API URL:', url);
    const response = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    console.log('Response status:', response.status, response.statusText);
    if (!response.ok) {
      const text = await response.text();
      console.error('API Error Response:', text);
      throw new Error(`Failed to fetch balance history: ${response.status} ${text}`);
    }
    const data: { list: BalanceHistory[] } = await response.json();
    console.log('Balance history fetched:', data);
    balanceHistory.value = data.list || [];
    console.log('Balance history count:', balanceHistory.value.length);
  } catch (error) {
    console.error('Error fetching balance history:', error);
    balanceHistory.value = [];
  }
};

// 获取资金变动明细（服务端分页：传 page、page_size，用接口返回的 total 做总条数）
const fetchFundChangeRecords = async () => {
  try {
    const params = new URLSearchParams();
    params.append('filter', recordFilter.value);
    params.append('page', recordPage.value.toString());
    params.append('page_size', recordPageSize.value.toString());
    if (chargeTypeFilter.value > 0) {
      params.append('charge_type', chargeTypeFilter.value.toString());
    }
    const response = await fetch(`${apiBaseUrl}api/userfund/user/${userId.value}/fund-changes?${params.toString()}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Failed to fetch fund change records');
    const data: { list: FundChangeRecord[]; total: number } = await response.json();
    fundChangeRecords.value = data.list || [];
    recordTotalFromServer.value = typeof data.total === 'number' ? data.total : 0;
    recordPage.value = clampRecordPage(recordPage.value);
    recordPageInput.value = recordPage.value;
  } catch (error) {
    console.error('Error fetching fund change records:', error);
  }
};

// 切换筛选
const switchFilter = (filter: string) => {
  recordFilter.value = filter;
  resetRecordPaging();
  fetchFundChangeRecords();
};

// 切换充值类型筛选
const switchChargeType = (type: number) => {
  chargeTypeFilter.value = type;
  resetRecordPaging();
  fetchFundChangeRecords();
};

// 导出 Excel
const exportToExcel = async () => {
  try {
    // 检查是否有数据
    if (!fundChangeRecords.value || fundChangeRecords.value.length === 0) {
      setSuccessToast('无可导出数据', '暂无数据可导出', 2000);
      return;
    }

    // 获取筛选文本
    const filterText = recordFilter.value === 'all' ? '全部' 
      : recordFilter.value === 'recharge' ? '仅充值' 
      : '仅扣减';

    // 准备导出数据（仅充值时包含批次字段）
    const includeBatch = recordFilter.value === 'recharge';
    const exportData = fundChangeRecords.value.map(record => {
      const base: Record<string, string | number> = {
        '交易时间': record.transaction_time,
        '类型说明': record.type_description,
        '充值类型': record.charge_type_desc || '-',
        '变动金额': record.change_amount > 0
          ? `+${formatCurrency(Math.abs(record.change_amount))}`
          : `-${formatCurrency(Math.abs(record.change_amount))}`,
        '操作人': record.operator || '-',
        '状态': record.status,
        '备注/原因': record.remarks || '-'
      };
      if (includeBatch && record.batch_id != null) {
        base['批次ID'] = record.batch_id;
        base['初始金额'] = record.initial_amount ?? 0;
        base['剩余额度'] = record.remaining_amount ?? 0;
        base['过期时间'] = record.expire_time ?? '-';
        base['批次状态'] = record.batch_status ?? '-';
      }
      return base;
    });

    // 创建工作簿
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // 设置列宽
    const colWidths = includeBatch
      ? [
          { wch: 20 }, { wch: 25 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
          { wch: 15 }, { wch: 14 }, { wch: 10 }, { wch: 30 }
        ]
      : [
          { wch: 20 }, { wch: 25 }, { wch: 16 }, { wch: 15 }, { wch: 14 }, { wch: 10 }, { wch: 30 }
        ];
    ws['!cols'] = colWidths;

    // 添加工作表到工作簿（工作表名称限制在31个字符以内）
    const sheetName = `资金变动明细_${filterText}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // 生成文件名（清理特殊字符）
    const username = (userDetail.value?.user?.username || '用户')
      .replace(/[<>:"/\\|?*]/g, '_') // 替换文件名不允许的字符
      .slice(0, 20); // 限制长度
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = new Date().toTimeString().slice(0, 5).replace(/:/g, '');
    const fileName = `${username}_资金变动明细_${filterText}_${dateStr}_${timeStr}.xlsx`;

    // 导出文件
    XLSX.writeFile(wb, fileName);

    // 显示成功提示
    setSuccessToast(
      '导出成功',
      `✅ Excel 文件已导出（共 ${formatCount(fundChangeRecords.value.length)} 条记录）：${fileName}`,
      4000
    );
  } catch (error) {
    console.error('导出 Excel 失败:', error);
    setSuccessToast('导出失败', '❌ 导出失败，请稍后重试', 3000);
  }
};

// 切换天数
const switchDays = async (days: number) => {
  console.log(`Switching to ${days} days view`);
  selectedDays.value = days;
  // 先获取数据
  await Promise.all([
    fetchConsumptionRecords(),
    fetchBalanceHistory()
  ]);
  // 等待 DOM 更新
  await nextTick();
  // 确保图表实例存在后再更新
  if (lineChart.value && barChart.value) {
    updateCharts();
  } else {
    // 如果图表实例不存在，等待一下再初始化
    setTimeout(() => {
      if (!lineChart.value || !barChart.value) {
        initCharts();
      } else {
        updateCharts();
      }
    }, 200);
  }
};

// 生成最近 N 天的日期数组 YYYY-MM-DD（含今天，从早到晚），本地日期
const lastNDays = (n: number): string[] => {
  const out: string[] = [];
  const pad = (x: number) => x.toString().padStart(2, '0');
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
};

// 日期格式化函数：统一格式化为 YYYY-MM-DD
const formatDateString = (dateStr: string): string => {
  if (!dateStr) return '';
  // 如果已经是 YYYY-MM-DD 格式，直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  // 尝试解析日期并格式化为 YYYY-MM-DD
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr; // 如果解析失败，返回原值
  const pad = (x: number) => x.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// 余额趋势：按日期补全，无数据日填 0；今天若缺则用 current_balance
const filledBalanceSeries = () => {
  const days = lastNDays(selectedDays.value);
  const map = new Map<string, number>();
  // 统一格式化 API 返回的日期
  for (const r of balanceHistory.value) {
    const formattedDay = formatDateString(r.day);
    map.set(formattedDay, r.balance ?? 0);
  }
  const pad = (x: number) => x.toString().padStart(2, '0');
  const t = new Date();
  const today = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  return days.map((d) => {
    if (map.has(d)) return map.get(d)!;
    if (d === today && userDetail.value != null) return userDetail.value.current_balance;
    return 0;
  });
};

// 资金流向：按日期补全，拆成自行消费与系统扣减
const filledConsumptionSeries = () => {
  const days = lastNDays(selectedDays.value);
  const map = new Map<string, { self: number; deduct: number }>();
  // 统一格式化 API 返回的日期
  for (const r of consumptionRecords.value) {
    const formattedDay = formatDateString(r.day);
    map.set(formattedDay, {
      self: r.self_consume ?? 0,
      deduct: r.system_deduct ?? 0
    });
  }
  const self: number[] = [];
  const deduct: number[] = [];
  for (const d of days) {
    const v = map.get(d);
    self.push(v ? v.self : 0);
    deduct.push(v ? v.deduct : 0);
  }
  return { days, self, deduct };
};

// 初始化图表
const initCharts = () => {
  // 曲线图
  const lineChartDom = document.getElementById('lineChart');
  if (lineChartDom) {
    lineChart.value = echarts.init(lineChartDom);
    console.log('Line chart initialized');
  } else {
    console.error('Line chart DOM not found');
  }

  // 柱状图
  const barChartDom = document.getElementById('barChart');
  if (barChartDom) {
    barChart.value = echarts.init(barChartDom);
    console.log('Bar chart initialized');
  } else {
    console.error('Bar chart DOM not found');
  }
  
  // 标记为未初始化，这样 updateCharts 会使用 notMerge: true
  isChartInitialized.value = false;
  updateCharts();
  // 更新后标记为已初始化
  isChartInitialized.value = true;
};

// 更新图表（始终用补全后的数据渲染，避免空白）
const updateCharts = () => {
  console.log('=== updateCharts called ===');
  console.log('balanceHistory:', balanceHistory.value);
  console.log('consumptionRecords:', consumptionRecords.value);
  console.log('selectedDays:', selectedDays.value);
  
  const balanceValues = filledBalanceSeries();
  const balanceDates = lastNDays(selectedDays.value).map((d) => {
    const date = new Date(d);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  });
  const { days: consumeDays, self: selfConsume, deduct: systemDeduct } = filledConsumptionSeries();
  const consumeDates = consumeDays.map((d) => {
    const date = new Date(d);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  });
  const selfConsumeSeriesData = selfConsume.map((value, idx) => {
    const hasDeductOnTop = (systemDeduct[idx] || 0) > 0;
    return {
      value,
      itemStyle: {
        borderRadius: hasDeductOnTop ? [0, 0, 0, 0] : [4, 4, 0, 0]
      }
    };
  });

  console.log('Balance values:', balanceValues);
  console.log('Balance dates:', balanceDates);
  console.log('Self consume:', selfConsume);
  console.log('System deduct:', systemDeduct);
  console.log('Consume dates:', consumeDates);

  // 近7天、近30天均显示相同样式的拖动条（含迷你概览、手柄），与第一张图一致
  const lenBalance = balanceDates.length;
  const showZoom = lenBalance > 7; // 只有超过7天时才显示 DataZoom
  // 30天时默认显示全部30天（从0开始到结束），7天时也显示全部
  const zoomStart = 0;
  const zoomEnd = lenBalance > 0 ? lenBalance - 1 : 0;
  console.log(`DataZoom config: showZoom=${showZoom}, lenBalance=${lenBalance}, zoomStart=${zoomStart}, zoomEnd=${zoomEnd}`);
  const dataZoomSlider = {
    type: 'slider' as const,
    xAxisIndex: 0,
    startValue: zoomStart,
    endValue: zoomEnd,
    realtime: true,
    filterMode: 'filter' as const,
    height: 14,
    bottom: 4,
    borderColor: 'transparent',
    fillerColor: 'rgba(59, 130, 246, 0.15)',
    backgroundColor: '#f1f5f9',
    handleSize: '70%',
    handleStyle: { color: '#94a3b8', borderColor: '#94a3b8' },
    moveHandleSize: 6,
    dataBackground: { lineStyle: { color: '#cbd5e1', width: 1 }, areaStyle: { color: 'transparent' } },
    selectedDataBackground: { lineStyle: { color: '#3b82f6', width: 1 }, areaStyle: { color: 'rgba(59, 130, 246, 0.08)' } },
    textStyle: { color: '#94a3b8', fontSize: 10 },
    borderRadius: 4
  };

  // 曲线图：余额趋势（补全后始终有数据）
  if (lineChart.value) {
    console.log('Updating line chart...');
    const lineOption: echarts.EChartsOption = {
      grid: { 
        left: '3%', 
        right: '4%', 
        bottom: showZoom ? '12%' : (selectedDays.value === 30 ? '8%' : '3%'), // 30天时底部留更多空间给旋转的标签
        containLabel: true 
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: '#ffffff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        borderRadius: 6,
        padding: [10, 14],
        textStyle: { fontSize: 13, color: '#374151' },
        extraCssText: 'z-index: 99999; box-shadow: 0 2px 12px rgba(0,0,0,0.15); min-width: 100px;',
        axisPointer: {
          type: 'line',
          lineStyle: { color: '#94a3b8', width: 1, type: 'dashed' }
        },
        formatter: function (params: any) {
          if (!Array.isArray(params) || params.length === 0) return '无数据';
          const p = params[0];
          const date = (p && p.axisValue != null) ? String(p.axisValue) : '';
          const value = (p && p.value != null) ? p.value : 0;
          return date + '<br/>账户余额 : ' + formatAmount(value);
        }
      },
      dataZoom: showZoom ? [dataZoomSlider] : undefined,
      xAxis: {
        type: 'category',
        data: balanceDates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { 
          color: '#6b7280',
          // 30天时自动间隔显示标签，避免重叠
          interval: selectedDays.value === 30 ? 'auto' : 0,
          rotate: selectedDays.value === 30 ? 45 : 0, // 30天时旋转45度避免重叠
          fontSize: 11
        }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#6b7280', formatter: (value: number) => formatAmount(value) },
        splitLine: { lineStyle: { color: '#f3f4f6' } }
      },
      series: [{
        name: '账户余额',
        data: balanceValues,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: selectedDays.value === 30 ? 4 : 6, // 30天时数据点更小
        showSymbol: selectedDays.value === 7, // 7天显示所有数据点，30天不显示（避免太密集）
        lineStyle: { color: '#3b82f6', width: 3 },
        itemStyle: { 
          color: '#3b82f6',
          borderWidth: 2,
          borderColor: '#ffffff'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
          ])
        },
        emphasis: {
          focus: 'series'
        },
        // 优化时间切换动画：启用通用过渡，让数据点之间平滑过渡
        universalTransition: true
      } as any],
      // 增强图表进场动画：从零生长效果
      animation: true,
      animationDuration: 1500, // 延长动画时长，让进场效果更明显
      animationEasing: 'cubicOut', // 使用更平滑的缓动函数
      animationDelay: (idx: number) => idx * 10, // 数据点依次出现，增强视觉层次
      // 切换 7天/30天 时使用更新动画，避免生硬跳变
      animationDurationUpdate: 900,
      animationEasingUpdate: 'cubicOut',
      animationDelayUpdate: (idx: number) => idx * 6
    };
    // 优化时间切换动画：使用 notMerge: false 让 ECharts 自动计算补间动画
    // 首次加载时使用 notMerge: true，后续切换时使用 notMerge: false 以启用过渡动画
    try {
      lineChart.value.setOption(lineOption, { 
        notMerge: !isChartInitialized.value, // 首次加载时完全替换，切换时合并以启用过渡动画
        replaceMerge: ['dataZoom'] // 确保 DataZoom 配置被完全替换
      });
    } catch (error) {
      console.error('Error setting line chart option:', error);
      // 如果出错，强制使用 notMerge: true
      lineChart.value.setOption(lineOption, { notMerge: true });
    }
    lineChart.value.resize();
    console.log('Line chart updated');
  } else {
    console.warn('Line chart not initialized!');
  }

  // 柱状图：堆叠 自行消费 + 系统扣减；近7天、近30天均显示与余额趋势相同的拖动条
  if (barChart.value) {
    console.log('Updating bar chart...');
    const consumeLen = consumeDates.length;
    const barShowZoom = consumeLen > 7; // 只有超过7天时才显示 DataZoom
    // 30天时默认显示全部30天（从0开始到结束），7天时也显示全部
    const barZoomStart = 0;
    const barZoomEnd = consumeLen > 0 ? consumeLen - 1 : 0;
    console.log(`Bar DataZoom config: barShowZoom=${barShowZoom}, consumeLen=${consumeLen}, barZoomStart=${barZoomStart}, barZoomEnd=${barZoomEnd}`);
    const barDataZoomSlider = {
      type: 'slider' as const,
      xAxisIndex: 0,
      startValue: barZoomStart,
      endValue: barZoomEnd,
      realtime: true,
      filterMode: 'filter' as const,
      height: 14,
      bottom: 4,
      borderColor: 'transparent',
      fillerColor: 'rgba(16, 185, 129, 0.15)',
      backgroundColor: '#f1f5f9',
      handleSize: '70%',
      handleStyle: { color: '#94a3b8', borderColor: '#94a3b8' },
      moveHandleSize: 6,
      dataBackground: { lineStyle: { color: '#cbd5e1', width: 1 }, areaStyle: { color: 'transparent' } },
      selectedDataBackground: { lineStyle: { color: '#10b981', width: 1 }, areaStyle: { color: 'rgba(16, 185, 129, 0.08)' } },
      textStyle: { color: '#94a3b8', fontSize: 10 },
      borderRadius: 4
    };
    const barOption: echarts.EChartsOption = {
      grid: { 
        left: '3%', 
        right: '4%', 
        bottom: barShowZoom ? '12%' : (selectedDays.value === 30 ? '8%' : '3%'), // 30天时底部留更多空间给旋转的标签
        containLabel: true 
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'shadow' },
        backgroundColor: '#ffffff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        borderRadius: 6,
        padding: [10, 14],
        textStyle: { fontSize: 13, color: '#374151' },
        extraCssText: 'z-index: 99999; box-shadow: 0 2px 12px rgba(0,0,0,0.15); min-width: 100px;',
        formatter: function (params: any) {
          if (!Array.isArray(params) || params.length === 0) return '无数据';
          const date = (params[0].axisValue != null) ? String(params[0].axisValue) : '';
          const getVal = (val: any) => (typeof val === 'number' ? val : (val?.value ?? 0));
          const selfVal = getVal(params[0].value);
          const deductVal = params[1] ? getVal(params[1].value) : 0;
          const totalVal = (selfVal || 0) + (deductVal || 0);
          return date + '<br/>' +
            '<span style="color:#10b981">自行消费 : ' + formatAmount(selfVal) + '</span><br/>' +
            '<span style="color:#ef4444">系统扣减 : ' + formatAmount(deductVal) + '</span><br/>' +
            '<span style="color:#111827">总消费 : ' + formatAmount(totalVal) + '</span>';
        }
      },
      dataZoom: barShowZoom ? [barDataZoomSlider] : undefined,
      xAxis: {
        type: 'category',
        data: consumeDates,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { 
          color: '#6b7280',
          // 30天时自动间隔显示标签，避免重叠
          interval: selectedDays.value === 30 ? 'auto' : 0,
          rotate: selectedDays.value === 30 ? 45 : 0, // 30天时旋转45度避免重叠
          fontSize: 11
        }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#6b7280', formatter: (value: number) => formatAmount(value) },
        splitLine: { lineStyle: { color: '#f3f4f6' } }
      },
      series: [
        {
          name: '自行消费',
          data: selfConsumeSeriesData,
          type: 'bar',
          stack: 'total',
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#10b981' },
              { offset: 1, color: '#059669' }
            ])
          },
          barWidth: '60%',
          // 优化时间切换动画：启用通用过渡，让柱状图之间平滑过渡
          universalTransition: true
        },
        {
          name: '系统扣减',
          data: systemDeduct,
          type: 'bar',
          stack: 'total',
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#ef4444' },
              { offset: 1, color: '#dc2626' }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          barWidth: '60%',
          // 优化时间切换动画：启用通用过渡，让柱状图之间平滑过渡
          universalTransition: true
        }
      ],
      // 增强图表进场动画：从零生长效果
      animation: true,
      animationDuration: 1500, // 延长动画时长，让进场效果更明显
      animationEasing: 'cubicOut', // 使用更平滑的缓动函数
      animationDelay: (idx: number) => idx * 10 // 数据点依次出现，增强视觉层次
    };
    // 优化时间切换动画：使用 notMerge: false 让 ECharts 自动计算补间动画
    // 首次加载时使用 notMerge: true，后续切换时使用 notMerge: false 以启用过渡动画
    try {
      barChart.value.setOption(barOption, { 
        notMerge: !isChartInitialized.value, // 首次加载时完全替换，切换时合并以启用过渡动画
        replaceMerge: ['dataZoom'] // 确保 DataZoom 配置被完全替换
      });
    } catch (error) {
      console.error('Error setting bar chart option:', error);
      // 如果出错，强制使用 notMerge: true
      barChart.value.setOption(barOption, { notMerge: true });
    }
    barChart.value.resize();
    console.log('Bar chart updated');
  } else {
    console.warn('Bar chart not initialized!');
  }
  console.log('=== updateCharts finished ===');
};

// 打开充值弹窗
const openRechargeModal = () => {
  showRechargeModal.value = true;
};

// 关闭充值弹窗
const closeRechargeModal = () => {
  showRechargeModal.value = false;
  showExpireDatePicker.value = false;
  rechargeAmount.value = 0;
  rechargeRemarks.value = '';
  rechargeChargeType.value = 1;
  rechargeExpireEnabled.value = false;
  rechargeExpireDate.value = '';
};

// 指定过期时间 - 日期选择器
const formatExpireDateDisplay = (ymd: string) => {
  if (!ymd || ymd.length < 10) return '';
  return `${ymd.slice(0, 4)}年${ymd.slice(5, 7)}月${ymd.slice(8, 10)}日`;
};
const expirePickerYear = computed(() => expirePickerViewDate.value.getFullYear());
const expirePickerMonth = computed(() => expirePickerViewDate.value.getMonth() + 1);
const expirePickerDays = computed(() => {
  const view = expirePickerViewDate.value;
  const y = view.getFullYear();
  const m = view.getMonth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // 周一为第一列
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevMonthDays = new Date(y, m, 0).getDate();
  const rows: { key: string; day: number; otherMonth: boolean; isToday: boolean; isSelected: boolean; disabled: boolean; year: number; month: number }[] = [];
  let cellIndex = 0;
  for (let i = 0; i < 42; i++) {
    let day: number;
    let otherMonth = false;
    let year = y;
    let month = m + 1;
    if (i < startOffset) {
      day = prevMonthDays - startOffset + 1 + i;
      otherMonth = true;
      year = m === 0 ? y - 1 : y;
      month = m === 0 ? 12 : m;
    } else if (i >= startOffset + daysInMonth) {
      day = i - startOffset - daysInMonth + 1;
      otherMonth = true;
      month = m + 2;
      if (month > 12) {
        year = y + 1;
        month = 1;
      }
    } else {
      day = i - startOffset + 1;
    }
    const cellDate = new Date(year, month - 1, day);
    cellDate.setHours(0, 0, 0, 0);
    const isToday = cellDate.getTime() === today.getTime();
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isSelected = rechargeExpireDate.value === ymd;
    const disabled = cellDate.getTime() < today.getTime();
    rows.push({ key: `cell-${cellIndex++}`, day, otherMonth, isToday, isSelected, disabled, year, month });
  }
  return rows;
});
const toggleExpireDatePicker = () => {
  showExpireDatePicker.value = !showExpireDatePicker.value;
  if (showExpireDatePicker.value && rechargeExpireDate.value) {
    const [y, m] = rechargeExpireDate.value.split('-').map(Number);
    expirePickerViewDate.value = new Date(y, m - 1, 1);
  } else if (showExpireDatePicker.value) {
    expirePickerViewDate.value = new Date();
  }
  if (showExpireDatePicker.value) {
    setTimeout(() => {
      const close = () => {
        showExpireDatePicker.value = false;
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    }, 0);
  }
};
const expirePickerPrevMonth = () => {
  const d = expirePickerViewDate.value;
  expirePickerViewDate.value = new Date(d.getFullYear(), d.getMonth() - 1, 1);
};
const expirePickerNextMonth = () => {
  const d = expirePickerViewDate.value;
  expirePickerViewDate.value = new Date(d.getFullYear(), d.getMonth() + 1, 1);
};
const selectExpireDate = (d: { year: number; month: number; day: number; disabled?: boolean }) => {
  if (d.disabled) return;
  rechargeExpireDate.value = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  showExpireDatePicker.value = false;
};
const clearExpireDate = () => {
  rechargeExpireDate.value = '';
  showExpireDatePicker.value = false;
};
const setExpireDateToday = () => {
  const d = new Date();
  rechargeExpireDate.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  showExpireDatePicker.value = false;
};

// 快速选择金额
const selectAmount = (amount: number) => {
  rechargeAmount.value = amount;
};

// 下一步（确认充值）
const nextStep = () => {
  if (rechargeAmount.value <= 0) {
    alert('请输入充值金额');
    return;
  }
  if (rechargeExpireEnabled.value && !rechargeExpireDate.value) {
    alert('请选择过期日期');
    return;
  }
  showRechargeModal.value = false;
  showConfirmModal.value = true;
};

// 返回修改
const backToEdit = () => {
  showConfirmModal.value = false;
  showRechargeModal.value = true;
};

// 确认充值
const confirmRecharge = async () => {
  try {
    const payload: Record<string, unknown> = {
      user_id: userId.value,
      amount: rechargeAmount.value,
      charge_type: rechargeChargeType.value,
      remarks: rechargeRemarks.value
    };
    if (rechargeExpireEnabled.value && rechargeExpireDate.value) {
      payload.expire_time = rechargeExpireDate.value;
    }
    const response = await fetch(`${apiBaseUrl}api/userfund/user/recharge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Recharge failed');
    const data = await response.json();
    showConfirmModal.value = false;
    
    // 显示成功提示：用户名过长时截断
    const username = userDetail.value?.user.username || '';
    const truncatedUsername = truncateText(username, 15); // 用户名最多显示15个字符
    setSuccessToast(
      '充值成功',
      `已为${truncatedUsername} 充值 ${formatCurrency(rechargeAmount.value)} 积分`
    );
    
    // 保存当前余额，用于滚动动画（使用实际显示的余额）
    const currentBalance = displayBalance.value || userDetail.value?.current_balance || 0;
    const rechargeAmountValue = rechargeAmount.value;
    
    // 计算新余额：优先使用接口返回的 new_balance（后端已经正确计算：原余额 + 充值金额）
    // 后端修复后，new_balance 应该是：用户数据库中的最新余额 + 充值金额
    let newBalance: number;
    if (data.new_balance !== undefined && data.new_balance !== null && data.new_balance >= 0) {
      // 使用后端返回的新余额（后端已经正确计算：原余额 + 充值金额）
      newBalance = data.new_balance;
      console.log(`充值成功：当前余额 ${currentBalance} + 充值金额 ${rechargeAmountValue} = 新余额 ${newBalance}`);
    } else {
      // 如果后端没有返回新余额，前端自己计算：当前余额 + 充值金额（兜底方案）
      newBalance = currentBalance + rechargeAmountValue;
      console.warn('后端未返回 new_balance，使用前端计算值:', newBalance);
    }
    
    // 更新目标余额和用户详情中的余额
    targetBalance.value = newBalance;
    if (userDetail.value) {
      userDetail.value.current_balance = newBalance;
    }
    
    // 从当前余额滚动到新余额，优化用户体验（不再从0开始）
    animateBalance(currentBalance, newBalance);
    
    // 充值后数据实时联动：切回全部筛选，保证新记录可见
    recordFilter.value = 'all';
    chargeTypeFilter.value = 0;
    resetRecordPaging();
    // 注意：不再调用 fetchUserDetail，因为我们已经手动更新了余额，避免覆盖
    await fetchFundChangeRecords();
    
    // 发送全局事件，通知用户列表页更新该用户的余额
    // 这样当用户返回列表页时，卡片上的余额会实时更新
    window.dispatchEvent(new CustomEvent('user-balance-updated', {
      detail: {
        user_id: userId.value,
        new_balance: newBalance
      }
    }));
    
    // toast auto hides in setSuccessToast
  } catch (error) {
    console.error('Recharge error:', error);
    alert('充值失败，请重试');
  }
};

// 打开扣减弹窗
const openDeductionModal = () => {
  showDeductionModal.value = true;
};

// 关闭扣减弹窗
const closeDeductionModal = () => {
  showDeductionModal.value = false;
  deductionAmount.value = 0;
  deductionRemarks.value = '';
  deductionChargeType.value = 5;
};

// 快速选择扣减金额
const selectDeductionAmount = (amount: number) => {
  deductionAmount.value = amount;
};

// 下一步（确认扣减）
const nextStepDeduction = () => {
  if (deductionAmount.value <= 0) {
    alert('请输入扣减金额');
    return;
  }
  // 不在前端做“余额不足”强校验，交由后端统一根据快照+增量逻辑校验，
  // 避免在测试场景下前端对旧余额的本地判断与后端真实余额不一致。
  showDeductionModal.value = false;
  showDeductionConfirmModal.value = true;
};

// 返回修改（扣减）
const backToEditDeduction = () => {
  showDeductionConfirmModal.value = false;
  showDeductionModal.value = true;
};

// 确认扣减
const confirmDeduction = async () => {
  try {
    const response = await fetch(`${apiBaseUrl}api/userfund/user/deduction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({
        user_id: userId.value,
        amount: deductionAmount.value,
        charge_type: deductionChargeType.value,
        remarks: deductionRemarks.value
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Deduction failed');
    }
    const data = await response.json();
    
    if (!data.success) {
      alert(data.message || '扣减失败');
      return;
    }
    
    showDeductionConfirmModal.value = false;
    
    // 显示成功提示：用户名过长时截断
    const username = userDetail.value?.user.username || '';
    const truncatedUsername = truncateText(username, 15);
    setSuccessToast(
      '扣减成功',
      `已为${truncatedUsername} 扣减 ${formatCurrency(deductionAmount.value)} 积分`
    );
    
    // 保存当前余额，用于滚动动画
    const currentBalance = displayBalance.value || userDetail.value?.current_balance || 0;
    const deductionAmountValue = deductionAmount.value;
    
    // 计算新余额：优先使用接口返回的 new_balance
    let newBalance: number;
    if (data.new_balance !== undefined && data.new_balance !== null && data.new_balance >= 0) {
      newBalance = data.new_balance;
      console.log(`扣减成功：当前余额 ${currentBalance} - 扣减金额 ${deductionAmountValue} = 新余额 ${newBalance}`);
    } else {
      // 如果后端没有返回新余额，前端自己计算
      newBalance = currentBalance - deductionAmountValue;
      console.warn('后端未返回 new_balance，使用前端计算值:', newBalance);
    }
    
    // 更新目标余额和用户详情中的余额
    targetBalance.value = newBalance;
    if (userDetail.value) {
      userDetail.value.current_balance = newBalance;
    }
    
    // 从当前余额滚动到新余额
    animateBalance(currentBalance, newBalance);
    
    // 扣减后数据实时联动：切回全部筛选，保证新记录可见
    recordFilter.value = 'all';
    chargeTypeFilter.value = 0;
    resetRecordPaging();
    // 刷新资金变动明细表格、消费记录和余额历史
    await Promise.all([
      fetchFundChangeRecords(),
      fetchConsumptionRecords(),
      fetchBalanceHistory()
    ]);
    
    // 发送全局事件，通知用户列表页更新该用户的余额
    window.dispatchEvent(new CustomEvent('user-balance-updated', {
      detail: {
        user_id: userId.value,
        new_balance: newBalance
      }
    }));
    
    // toast auto hides in setSuccessToast
  } catch (error: any) {
    console.error('Deduction error:', error);
    alert(error.message || '扣减失败，请重试');
  }
};

// 格式化日期
const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN');
};

// 格式化时间
const formatDateTime = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
};

// 计数类显示为整数
const formatCount = (value: number | null | undefined) => {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return Math.trunc(num).toLocaleString('zh-CN');
};

// 金额/数值显示两位小数
const formatAmount = (value: number | null | undefined) => {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 格式化金额
const formatCurrency = (value: number | null | undefined) => {
  return formatAmount(value);
};

// 截断文本，过长时显示省略号
const truncateText = (text: string, maxLength: number = 20): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// 返回用户列表：直接跳转到列表页，保持在同一个标签页内
const goBackToList = () => {
  // 直接使用 replace 跳转到列表页，这样会更新当前标签页的路径
  // 根据 App.vue 的 addTab 逻辑，如果 /user-fund 标签页已存在，会切换到已存在的标签页
  // 如果不存在，会在当前标签页内更新路径，不会创建新标签页
  router.replace('/user-fund');
};

// 复制用户ID
const copyUserId = async () => {
  if (!userDetail.value) return;
  
  const userId = userDetail.value.user.user_id;
  
  try {
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(userId);
      showCopySuccess('用户ID已复制到剪贴板');
    } else {
      // 降级方案：使用传统的 execCommand
      const textArea = document.createElement('textarea');
      textArea.value = userId;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          showCopySuccess('用户ID已复制到剪贴板');
        } else {
          showCopyError('复制失败，请手动复制');
        }
      } catch (err) {
        console.error('Fallback copy failed:', err);
        showCopyError('复制失败，请手动复制');
      } finally {
        document.body.removeChild(textArea);
      }
    }
  } catch (error) {
    console.error('Failed to copy:', error);
    showCopyError('复制失败，请手动复制');
  }
};

// 显示复制成功提示
const showCopySuccess = (message: string) => {
  copyToastMessage.value = message;
  showCopyToast.value = true;
  setTimeout(() => {
    showCopyToast.value = false;
  }, 2000);
};

// 显示复制失败提示
const showCopyError = (message: string) => {
  copyToastMessage.value = message;
  showCopyToast.value = true;
  setTimeout(() => {
    showCopyToast.value = false;
  }, 2000);
};

const onResize = () => {
  lineChart.value?.resize();
  barChart.value?.resize();
};

// 加载所有数据的统一函数
const loadUserData = async () => {
  if (!userId.value) return;
  
  loading.value = true;
  // 重置状态
  userDetail.value = null;
  consumptionRecords.value = [];
  balanceHistory.value = [];
  fundChangeRecords.value = [];
  selectedDays.value = 7;
  recordFilter.value = 'all';
  rechargeChargeType.value = 1;
  deductionChargeType.value = 5;
  chargeTypeFilter.value = 0;
  displayBalance.value = 0;
  targetBalance.value = 0;
  
  // 销毁旧图表
  if (lineChart.value) {
    lineChart.value.dispose();
    lineChart.value = null;
  }
  if (barChart.value) {
    barChart.value.dispose();
    barChart.value = null;
  }
  // 重置图表初始化标志
  isChartInitialized.value = false;
  
  try {
    // 获取所有数据
    await Promise.all([
      fetchUserDetail(),
      fetchConsumptionRecords(),
      fetchBalanceHistory(),
      fetchFundChangeRecords()
    ]);
    
    loading.value = false;
    await nextTick();
    
    // 初始化图表
    setTimeout(() => {
      initCharts();
    }, 50);
  } catch (error) {
    console.error('Error loading user data:', error);
    loading.value = false;
  }
};

// 监听路由参数变化，当用户ID变化时重新加载数据
watch(
  () => route.params.user_id,
  async (newUserId, oldUserId) => {
    // 只有当用户ID真正变化时才重新加载
    if (newUserId && newUserId !== oldUserId) {
      console.log(`User ID changed from ${oldUserId} to ${newUserId}, reloading data...`);
      await loadUserData();
    }
  },
  { immediate: false }
);

onMounted(async () => {
  await loadUserData();
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  lineChart.value?.dispose();
  barChart.value?.dispose();
});
</script>

<template>
  <div class="user-detail-container">
    <!-- 页面标题 -->
    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title">星量用户资金管理</h1>
        <p class="page-subtitle" v-if="userDetail" :title="`正在查看用户 ${userDetail.user.username} 的消费详情`">
          正在查看用户 <span class="username-truncate">{{ userDetail.user.username }}</span> 的消费详情
        </p>
      </div>
      <button class="back-btn" @click="goBackToList">
        <span class="arrow">◄</span> 返回用户列表
      </button>
    </header>

    <div v-if="loading" class="loading-state">
      加载中...
    </div>

    <div v-else-if="userDetail">
      <!-- Top 区域：用户画像 & AI资金洞察 -->
      <div class="top-section">
        <!-- 左侧：用户信息卡片 (30%) -->
        <div class="user-info-card">
          <div class="user-avatar-container">
            <img 
              v-if="userDetail.user.avatar_url" 
              :src="userDetail.user.avatar_url" 
              :alt="userDetail.user.username" 
              class="user-avatar" 
            />
            <div v-else class="user-avatar-placeholder">
              {{ userDetail.user.username.charAt(0).toUpperCase() }}
            </div>
          </div>
          <div class="user-info">
            <h2 class="user-name" :title="userDetail.user.username">{{ userDetail.user.username }}</h2>
            <div class="user-id">
              ID: {{ userDetail.user.user_id }}
              <button class="copy-btn" @click="copyUserId">📋</button>
            </div>
            <div class="user-tags">
              <span class="tag tag-high-value" v-if="userDetail.current_balance > 1000">高价值用户</span>
              <span class="tag tag-active">活跃</span>
            </div>
            <div class="user-meta">
              <div class="meta-item">
                <span class="meta-label">注册时间</span>
                <span class="meta-value">{{ formatDate(userDetail.user.create_time) }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">最近登录</span>
                <span class="meta-value">{{ formatDateTime(userDetail.user.last_login_at) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：AI资金洞察卡片 (70%) -->
        <div class="insight-card">
          <div class="insight-header">
            <h3 class="insight-title">⭐ 星量资金洞察</h3>
            <div class="action-buttons">
              <button class="recharge-btn" @click="openRechargeModal">
                💰 人工充值
              </button>
              <button class="deduction-btn" @click="openDeductionModal">
                ⚠️ 人工扣减
              </button>
            </div>
          </div>
          <div class="balance-section">
            <div class="balance-label">当前可用余额</div>
            <div class="balance-amount tech-balance">
              {{ formatCurrency(displayBalance) }}
            </div>
          </div>
          <div class="runway-section">
            <div class="runway-label">资金续航预估 (Runway)</div>
            <div class="runway-value">~{{ formatCount(userDetail.fund_runway) }} 天</div>
            <div class="runway-bar">
              <div 
                class="runway-progress" 
                :style="{ width: `${Math.min((userDetail.fund_runway / 30) * 100, 100)}%` }"
              ></div>
            </div>
          </div>
          <div class="consumption-section">
            <div class="consumption-label">日均消费</div>
            <div class="consumption-value">{{ formatCurrency(userDetail.daily_consumption) }}/天</div>
          </div>
        </div>
      </div>

      <!-- Middle 区域：图表 -->
      <div class="charts-section">
        <!-- 左图：余额趋势分析 -->
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">余额趋势分析</h3>
            <div class="chart-controls">
              <button 
                class="time-btn" 
                :class="{ active: selectedDays === 7 }"
                @click="switchDays(7)"
              >
                近7天
              </button>
              <button 
                class="time-btn" 
                :class="{ active: selectedDays === 30 }"
                @click="switchDays(30)"
              >
                近30天
              </button>
            </div>
          </div>
          <div id="lineChart" class="chart-container"></div>
        </div>

        <!-- 右图：资金流向构成 -->
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">用户消费统计</h3>
            <div class="chart-legend">
              <span class="legend-item">
                <span class="legend-color" style="background: #10b981;"></span>
                自行消费
              </span>
              <span class="legend-item">
                <span class="legend-color" style="background: #ef4444;"></span>
                系统扣减
              </span>
            </div>
          </div>
          <div id="barChart" class="chart-container"></div>
        </div>
      </div>
    </div>

    <!-- Bottom 区域：资金变动明细 -->
    <div v-if="userDetail" class="detail-table-section">
      <div class="table-header">
        <h3 class="table-title">📋 资金变动明细</h3>
        <div class="table-controls">
          <button 
            class="filter-btn" 
            :class="{ active: recordFilter === 'all' }"
            @click="switchFilter('all')"
          >
            全部
          </button>
          <button 
            class="filter-btn"
            :class="{ active: recordFilter === 'recharge' }"
            @click="switchFilter('recharge')"
          >
            仅充值
          </button>
          <button 
            class="filter-btn"
            :class="{ active: recordFilter === 'deduction' }"
            @click="switchFilter('deduction')"
          >
            仅扣减
          </button>
          <select
            v-model.number="chargeTypeFilter"
            class="charge-type-select"
            @change="switchChargeType(chargeTypeFilter)"
          >
            <option :value="0">全部充值类型</option>
            <option :value="1">用户常规充值</option>
            <option :value="2">系统故障补偿</option>
            <option :value="3">活动赠送</option>
            <option :value="4">过期扣减</option>
            <option :value="5">管理员扣减</option>
          </select>
          <button class="export-btn" @click="exportToExcel" :disabled="fundChangeRecords.length === 0" title="导出当前筛选条件下的资金变动明细">
            📊 {{ fundChangeRecords.length === 0 ? '无数据可导出' : '导出 Excel' }}
          </button>
        </div>
      </div>
      <div class="table-container">
        <table class="detail-table">
          <thead>
            <tr>
              <th>交易时间</th>
              <th>类型说明</th>
              <th>充值类型</th>
              <th v-if="recordFilter === 'recharge'">批次ID</th>
              <th v-if="recordFilter === 'recharge'">初始金额</th>
              <th v-if="recordFilter === 'recharge'">剩余额度</th>
              <th v-if="recordFilter === 'recharge'">过期时间</th>
              <th v-if="recordFilter === 'recharge'" class="col-batch-status">批次状态</th>
              <th>变动金额</th>
              <th>操作人</th>
              <th class="col-status">状态</th>
              <th>备注/原因</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="(record, index) in pagedFundChangeRecords" 
              :key="index"
              :class="record.change_amount > 0 ? 'row-recharge' : 'row-deduction'"
            >
              <td>{{ record.transaction_time }}</td>
              <td class="type-cell">
                <!-- 全部：带充值/扣减标签；仅充值：只显示类型说明文字 -->
                <template v-if="recordFilter === 'all'">
                  <span 
                    class="type-badge" 
                    :class="record.change_amount > 0 ? 'type-recharge' : 'type-deduction'"
                  >
                    <span class="type-icon" :class="record.change_amount > 0 ? 'recharge' : 'deduction'">
                      {{ record.change_amount > 0 ? '💳' : '⚠️' }}
                    </span>
                    {{ record.change_amount > 0 ? '充值' : '扣减' }}
                  </span>
                  <span class="type-desc">{{ record.type_description }}</span>
                </template>
                <span v-else class="type-desc">{{ record.type_description }}</span>
              </td>
              <td>{{ record.charge_type_desc || '-' }}</td>
              <!-- 仅充值时展示批次详情 -->
              <td v-if="recordFilter === 'recharge'" class="mono-font">#{{ record.batch_id ?? '-' }}</td>
              <td v-if="recordFilter === 'recharge'">{{ record.initial_amount != null ? formatCurrency(record.initial_amount) : '-' }}</td>
              <td v-if="recordFilter === 'recharge'" class="remaining-cell">
                <template v-if="record.initial_amount != null && record.initial_amount > 0">
                  <!-- 已过期：展示「过期时剩余」金额与进度条 -->
                  <template v-if="record.batch_status === '已过期'">
                    <div class="remaining-compact">
                      <div class="remaining-row-top">
                        <span class="remaining-val remaining-at-expire-label">{{ formatCurrency(record.remaining_at_expire ?? 0) }}</span>
                        <span class="remaining-percent">{{ record.initial_amount > 0 ? Math.round(((record.remaining_at_expire ?? 0) / record.initial_amount) * 100) : 0 }}%</span>
                      </div>
                      <div class="remaining-progress-bg">
                        <div 
                          class="remaining-progress-fill bar-expired"
                          :style="{ width: Math.min(100, ((record.remaining_at_expire ?? 0) / record.initial_amount) * 100) + '%' }"
                        ></div>
                      </div>
                      <div class="remaining-hint">过期时剩余</div>
                    </div>
                  </template>
                  <!-- 使用中/已耗尽：展示当前剩余额度（负值时显示为 0，并额外标红透支标签） -->
                  <div v-else class="remaining-compact">
                    <!-- 透支标签：放在数值上方 -->
                    <div
                      v-if="getRemainingDisplay(record).overdraft > 0"
                      class="remaining-overdraft-tag"
                    >
                      透支 {{ formatCurrency(getRemainingDisplay(record).overdraft) }}
                    </div>
                    <div class="remaining-row-top">
                      <span class="remaining-val">
                        {{ formatCurrency(getRemainingDisplay(record).displayRemain) }}
                      </span>
                      <span class="remaining-percent">
                        {{ getRemainingDisplay(record).percentText }}
                      </span>
                    </div>
                    <div class="remaining-progress-bg">
                      <div 
                        class="remaining-progress-fill" 
                        :style="{ width: Math.min(100, getRemainingDisplay(record).percent) + '%' }"
                        :class="{ 'bar-empty': getRemainingDisplay(record).percent <= 0 }"
                      ></div>
                    </div>
                  </div>
                </template>
                <span v-else>-</span>
              </td>
              <td v-if="recordFilter === 'recharge'" class="expire-cell">
                <span v-if="record.expire_time" :class="{'text-gray': record.expire_time === '永久有效'}">{{ record.expire_time }}</span>
                <span v-else>-</span>
              </td>
              <td v-if="recordFilter === 'recharge'" class="col-batch-status">
                <span 
                  v-if="record.batch_status" 
                  class="batch-status-badge"
                  :class="getBatchStatusClass(record)"
                >
                  {{ getBatchStatusDisplay(record) }}
                </span>
                <span v-else>-</span>
              </td>
              <td>
                <span 
                  class="amount-pill"
                  :class="record.change_amount > 0 ? 'amount-positive' : 'amount-negative'"
                >
                  {{ record.change_amount > 0 ? '+' : '-' }}{{ formatCurrency(Math.abs(record.change_amount)) }}
                </span>
              </td>
              <td>{{ record.operator || '-' }}</td>
              <td class="col-status"><span class="status-badge success">{{ record.status }}</span></td>
              <td class="remarks-cell" :title="record.remarks || '-'">
                <!-- 仅充值：全部备注统一为可点击「详情」查看完整内容；全部/仅扣减：保持原样只显示文字 -->
                <template v-if="recordFilter === 'recharge'">
                  <div class="remarks-action" @click="showRemarksModal(record.remarks || '-')">
                    详情
                  </div>
                </template>
                <div v-else class="remarks-text">{{ record.remarks || '-' }}</div>
              </td>
            </tr>
            <tr v-if="totalRecordCount === 0">
              <td :colspan="recordFilter === 'recharge' ? 12 : 7" style="text-align: center; color: #9ca3af; padding: 40px;">
                暂无数据
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="totalRecordCount > 0" class="pagination-bar">
        <div class="pagination-info">
          共 <span class="pagination-strong">{{ formatCount(totalRecordCount) }}</span> 条，当前显示
          <span class="pagination-strong">{{ formatCount(recordPageStart) }}</span> - <span class="pagination-strong">{{ formatCount(recordPageEnd) }}</span>
        </div>
        <div class="pagination-controls">
          <button class="page-btn" :disabled="recordPage === 1" @click="goToRecordPage(1)">首页</button>
          <button class="page-btn" :disabled="recordPage === 1" @click="goToRecordPage(recordPage - 1)">上一页</button>
          <div class="page-badge">第 {{ formatCount(recordPage) }} / {{ formatCount(totalRecordPages) }} 页</div>
          <button class="page-btn" :disabled="recordPage === totalRecordPages" @click="goToRecordPage(recordPage + 1)">下一页</button>
          <button class="page-btn" :disabled="recordPage === totalRecordPages" @click="goToRecordPage(totalRecordPages)">末页</button>
          <div class="page-size">
            <span>每页</span>
            <select
              v-model.number="recordPageSize"
              class="page-size-select"
              @change="changeRecordPageSize(recordPageSize)"
            >
              <option v-for="size in recordPageSizeOptions" :key="size" :value="size">
                {{ size }}
              </option>
            </select>
            <span>条</span>
          </div>
          <div class="page-jump">
            <span>跳转</span>
            <input
              type="number"
              min="1"
              :max="totalRecordPages"
              v-model.number="recordPageInput"
              class="page-jump-input"
              @keyup.enter="jumpToRecordPage"
            />
            <button class="page-btn ghost" @click="jumpToRecordPage">确定</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 人工充值弹窗 -->
    <div v-if="showRechargeModal" class="modal-overlay" @click="closeRechargeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">人工充值</h3>
          <button class="modal-close" @click="closeRechargeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="user-info-box">
            <div class="info-avatar">
              <img 
                v-if="userDetail?.user.avatar_url" 
                :src="userDetail.user.avatar_url" 
                :alt="userDetail.user.username" 
              />
              <div v-else class="avatar-placeholder">
                {{ userDetail?.user.username.charAt(0).toUpperCase() }}
              </div>
            </div>
            <div class="info-text">
              <div>正在为 <span class="username-truncate-inline" :title="userDetail?.user.username">{{ userDetail?.user.username }}</span> 充值</div>
              <div>当前余额: {{ formatCurrency(userDetail?.current_balance || 0) }}</div>
            </div>
          </div>
          <div class="input-group">
            <label>充值金额</label>
            <div class="amount-input-wrapper">
              <input 
                type="number" 
                v-model.number="rechargeAmount" 
                class="amount-input"
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>
            <div class="quick-amounts">
              <button 
                v-for="amount in [100, 500, 1000, 5000]" 
                :key="amount"
                class="quick-amount-btn"
                @click="selectAmount(amount)"
              >
                +{{ formatAmount(amount) }}
              </button>
            </div>
          </div>
        <div class="input-group">
          <label>充值类型</label>
          <select v-model.number="rechargeChargeType" class="modal-select">
            <option :value="1">用户常规充值</option>
            <option :value="2">系统故障补偿</option>
            <option :value="3">活动赠送</option>
          </select>
        </div>
        <div class="input-group expire-time-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="rechargeExpireEnabled" class="modal-checkbox" />
            指定过期时间
          </label>
          <div v-if="rechargeExpireEnabled" class="date-picker-wrap">
            <input
              type="text"
              :value="rechargeExpireDate ? formatExpireDateDisplay(rechargeExpireDate) : ''"
              readonly
              class="modal-input date-input date-input-full"
              placeholder="请选择日期"
              @click="toggleExpireDatePicker"
            />
            <div v-if="showExpireDatePicker" class="expire-date-picker-popup" @click.stop>
              <div class="expire-date-picker-header">
                <button type="button" class="expire-date-nav" @click="expirePickerPrevMonth">‹</button>
                <span class="expire-date-title">{{ expirePickerYear }}年{{ expirePickerMonth }}月</span>
                <button type="button" class="expire-date-nav" @click="expirePickerNextMonth">›</button>
              </div>
              <div class="expire-date-picker-weekdays">
                <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>
              </div>
              <div class="expire-date-picker-grid">
                <button
                  v-for="d in expirePickerDays"
                  :key="d.key"
                  type="button"
                  class="expire-date-cell"
                  :class="{
                    'other-month': d.otherMonth,
                    'today': d.isToday,
                    'selected': d.isSelected,
                    'disabled': d.disabled
                  }"
                  :disabled="d.disabled"
                  @click="d.disabled ? null : selectExpireDate(d)"
                >
                  {{ d.day }}
                </button>
              </div>
              <div class="expire-date-picker-footer">
                <button type="button" class="expire-date-btn secondary" @click="clearExpireDate">清除</button>
                <button type="button" class="expire-date-btn primary" @click="setExpireDateToday">今天</button>
              </div>
            </div>
          </div>
          <span v-else class="hint-text">不选则永久有效</span>
        </div>
          <div class="input-group">
            <label>备注</label>
            <textarea 
              v-model="rechargeRemarks" 
              class="remarks-input"
              placeholder="备注..."
              rows="3"
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="closeRechargeModal">取消</button>
          <button class="btn-next" @click="nextStep">下一步</button>
        </div>
      </div>
    </div>

    <!-- 确认充值弹窗 -->
    <div v-if="showConfirmModal" class="modal-overlay" @click="backToEdit">
      <div class="modal-content confirm-modal confirm-modal-recharge" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">请再次确认</h3>
        </div>
        <div class="modal-body">
          <div class="warning-box warning-box-recharge">
            <span class="warning-icon">⚠️</span>
            <p class="warning-text">此操作将直接修改用户账户余额</p>
          </div>
          <div class="summary-box">
            <h4 class="summary-title">交易摘要</h4>
            <div class="summary-item">
              <span class="summary-label">充值对象</span>
              <span class="summary-value username-truncate-inline" :title="userDetail?.user.username">{{ userDetail?.user.username }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">充值金额</span>
              <span class="summary-value amount-positive">+{{ formatCurrency(rechargeAmount) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">充值后余额</span>
              <span class="summary-value">{{ formatCurrency((userDetail?.current_balance || 0) + rechargeAmount) }}</span>
            </div>
            <div v-if="rechargeExpireEnabled && rechargeExpireDate" class="summary-item">
              <span class="summary-label">过期时间</span>
              <span class="summary-value">{{ rechargeExpireDate }}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-confirm btn-confirm-recharge" @click="confirmRecharge">
            ✓ 确认立即充值
          </button>
          <button class="btn-back" @click="backToEdit">返回修改</button>
        </div>
      </div>
    </div>

    <!-- 人工扣减弹窗 -->
    <div v-if="showDeductionModal" class="modal-overlay" @click="closeDeductionModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">人工扣减</h3>
          <button class="modal-close" @click="closeDeductionModal">×</button>
        </div>
        <div class="modal-body">
          <div class="user-info-box">
            <div class="info-avatar">
              <img 
                v-if="userDetail?.user.avatar_url" 
                :src="userDetail.user.avatar_url" 
                :alt="userDetail.user.username" 
              />
              <div v-else class="avatar-placeholder">
                {{ userDetail?.user.username.charAt(0).toUpperCase() }}
              </div>
            </div>
            <div class="info-text">
              <div>正在为 <span class="username-truncate-inline" :title="userDetail?.user.username">{{ userDetail?.user.username }}</span> 扣减</div>
              <div>当前余额: {{ formatCurrency(userDetail?.current_balance || 0) }}</div>
            </div>
          </div>
          <div class="input-group">
            <label>扣减金额</label>
            <div class="amount-input-wrapper">
              <input 
                type="number" 
                v-model.number="deductionAmount" 
                class="amount-input"
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>
          </div>
        <div class="input-group">
          <label>扣减类型</label>
          <select v-model.number="deductionChargeType" class="modal-select">
            <option :value="5">管理员扣减</option>
            <option :value="4">过期扣减</option>
          </select>
        </div>
          <div class="quick-amounts">
            <button 
              v-for="amount in [100, 500, 1000, 5000]" 
              :key="amount"
              class="quick-amount-btn"
              @click="selectDeductionAmount(amount)"
            >
              -{{ formatAmount(amount) }}
            </button>
          </div>
          <div class="input-group">
            <label>备注/原因</label>
            <textarea 
              v-model="deductionRemarks" 
              class="remarks-input"
              placeholder="请输入扣减原因..."
              rows="3"
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="closeDeductionModal">取消</button>
          <button class="btn-next" @click="nextStepDeduction">下一步</button>
        </div>
      </div>
    </div>

    <!-- 确认扣减弹窗 -->
    <div v-if="showDeductionConfirmModal" class="modal-overlay" @click="backToEditDeduction">
      <div class="modal-content confirm-modal" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">请再次确认</h3>
        </div>
        <div class="modal-body">
          <div class="warning-box danger">
            <span class="warning-icon">⚠️</span>
            <p class="warning-text">此操作将直接扣减用户账户余额，请谨慎操作</p>
          </div>
          <div class="summary-box">
            <h4 class="summary-title">交易摘要</h4>
            <div class="summary-item">
              <span class="summary-label">扣减对象</span>
              <span class="summary-value username-truncate-inline" :title="userDetail?.user.username">{{ userDetail?.user.username }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">扣减金额</span>
              <span class="summary-value amount-negative">-{{ formatCurrency(deductionAmount) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">扣减类型</span>
              <span class="summary-value">
                {{
                  deductionChargeType === 5
                    ? '管理员扣减'
                    : deductionChargeType === 4
                      ? '过期扣减'
                      : '未知类型'
                }}
              </span>
            </div>
            <div class="summary-item">
              <span class="summary-label">扣减后余额</span>
              <span class="summary-value">{{ formatCurrency((userDetail?.current_balance || 0) - deductionAmount) }}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-confirm danger" @click="confirmDeduction">
            ✓ 确认立即扣减
          </button>
          <button class="btn-back" @click="backToEditDeduction">返回修改</button>
        </div>
      </div>
    </div>

    <!-- 备注详情弹窗 -->
    <div v-if="showRemarksDetailModal" class="modal-overlay" @click="closeRemarksModal">
      <div class="modal-content remarks-modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">备注详情</h3>
          <button class="modal-close" @click="closeRemarksModal">×</button>
        </div>
        <div class="modal-body">
          <div class="remarks-detail-text">{{ currentRemarks }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="closeRemarksModal">关闭</button>
        </div>
      </div>
    </div>

    <!-- 充值成功提示 -->
    <transition name="toast-slide">
      <div v-if="showSuccessToast" class="success-toast" :title="successMessage">
        <div class="toast-icon">✓</div>
        <div class="toast-content">
          <div class="toast-title">{{ successTitle }}</div>
          <div class="toast-message">{{ successMessage }}</div>
          <div class="toast-time">{{ formatDateTime(new Date().toISOString()) }}</div>
        </div>
      </div>
    </transition>

    <!-- 复制提示 -->
    <transition name="toast-slide">
      <div v-if="showCopyToast" class="copy-toast">
        <div class="toast-icon">📋</div>
        <div class="toast-content">
          <div class="toast-message">{{ copyToastMessage }}</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.user-detail-container {
  padding: 24px;
  background: #f5f5f5;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left {
  flex: 1;
}

.back-btn {
  padding: 10px 20px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #374151;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.back-btn .arrow {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  display: inline-block;
  transform: translateX(0);
  transition: transform 0.3s;
}

.back-btn:hover {
  background: #f9fafb;
  border-color: #d1d5db;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.back-btn:hover .arrow {
  transform: translateX(-3px);
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 8px 0;
  padding-left: 12px;
  border-left: 4px solid #3b82f6;
}

.page-subtitle {
  color: #6b7280;
  font-size: 14px;
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

/* 用户名截断样式 */
.username-truncate {
  display: inline-block;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

/* 内联用户名截断样式（用于弹窗等场景） */
.username-truncate-inline {
  display: inline-block;
  max-width: 150px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

/* Top 区域：用户画像 & AI资金洞察 */
.top-section {
  display: grid;
  grid-template-columns: 30% 70%;
  gap: 16px;
  margin-bottom: 20px;
}

/* Middle 区域：图表 */
.charts-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;
  overflow: visible;
}

/* 用户信息卡片 */
.user-info-card {
  background: white;
  border-radius: 12px;
  padding: 14px 18px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-avatar-container {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 6px;
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 18px;
  font-weight: 600;
}

.user-name {
  font-size: 17px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 4px 0;
  /* 优化用户名称展示：文本截断，避免换行或撑开布局 */
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-id {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.copy-btn:hover {
  opacity: 1;
}

.user-tags {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.tag {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.tag-high-value {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  color: white;
}

.tag-active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.meta-label {
  color: #6b7280;
}

.meta-value {
  color: #111827;
  font-weight: 500;
}

/* AI资金洞察卡片 */
.insight-card {
  background: linear-gradient(135deg, #1e3a8a 0%, #312e81 100%);
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  color: white;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.insight-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.insight-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.balance-section {
  margin-bottom: 10px;
}

.balance-label {
  font-size: 13px;
  opacity: 0.9;
  margin-bottom: 4px;
}

.tech-balance {
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: balanceGlow 2s ease-in-out infinite;
}

@keyframes balanceGlow {
  0%, 100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.2);
  }
}

.action-buttons {
  display: flex;
  gap: 12px;
  align-items: center;
}

.recharge-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.recharge-btn:hover {
  background: #2563eb;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.deduction-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
}

.deduction-btn:hover {
  background: #dc2626;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.runway-section {
  margin-bottom: 8px;
}

.runway-label {
  font-size: 13px;
  opacity: 0.9;
  margin-bottom: 4px;
}

.runway-value {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 6px;
}

.runway-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.runway-progress {
  height: 100%;
  background: linear-gradient(90deg, #10b981 0%, #3b82f6 100%);
  border-radius: 4px;
  transition: width 0.5s ease;
}

.consumption-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.consumption-label {
  font-size: 13px;
  opacity: 0.9;
}

.consumption-value {
  font-size: 15px;
  font-weight: 600;
}

/* 图表卡片 */
.chart-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.chart-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.chart-controls {
  display: flex;
  gap: 8px;
}

.time-btn {
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  color: #6b7280;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.time-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.time-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.chart-legend {
  display: flex;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #6b7280;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.chart-container {
  width: 100%;
  height: 350px;
  margin-top: 16px;
  overflow: visible;
}

/* 表格区域 */
.detail-table-section {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.table-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.table-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filter-btn {
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  color: #6b7280;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.charge-type-select {
  padding: 6px 28px 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  color: #6b7280;
  font-size: 14px;
  line-height: 20px;
  height: 32px;
  cursor: pointer;
  transition: all 0.2s;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 12px;
}

.charge-type-select:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.charge-type-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.filter-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.filter-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

.export-btn {
  padding: 8px 16px;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.export-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
  transform: translateY(-1px);
}

.export-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
}

.export-btn:disabled {
  background: #e5e7eb;
  border-color: #d1d5db;
  color: #9ca3af;
  cursor: not-allowed;
  box-shadow: none;
}

.table-container {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.detail-table {
  width: 100%;
  min-width: 800px;
  border-collapse: collapse;
}

.detail-table th {
  text-align: left;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  border-bottom: 2px solid #e5e7eb;
  white-space: nowrap;
  min-width: 60px;
}

.detail-table td {
  padding: 12px;
  font-size: 14px;
  color: #111827;
  border-bottom: 1px solid #f3f4f6;
}

.detail-table tbody tr {
  transition: background-color 0.2s ease;
}

.detail-table tbody tr:hover {
  background-color: #f9fafb;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
}

.pagination-info {
  font-size: 13px;
  color: #6b7280;
}

.pagination-strong {
  color: #111827;
  font-weight: 600;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.page-btn {
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  color: #374151;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: #3b82f6;
  color: #2563eb;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.15);
}

.page-btn:disabled {
  color: #9ca3af;
  background: #f9fafb;
  cursor: not-allowed;
  box-shadow: none;
}

.page-btn.ghost {
  background: #f3f4f6;
}

.page-badge {
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f9fafb;
  font-size: 13px;
  color: #374151;
}

.page-size {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #6b7280;
}

.page-size-select {
  padding: 4px 24px 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  color: #374151;
  font-size: 13px;
  line-height: 18px;
  height: 28px;
  cursor: pointer;
  transition: all 0.2s;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 12px;
}

.page-size-select:hover {
  border-color: #3b82f6;
  color: #2563eb;
}

.page-size-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.page-jump {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #6b7280;
}

.page-jump-input {
  width: 64px;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  transition: all 0.2s;
}

.page-jump-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.row-recharge td:first-child {
  border-left: 3px solid #10b981;
}

.row-deduction td:first-child {
  border-left: 3px solid #ef4444;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  margin-right: 8px;
  line-height: 1;
}

.type-recharge {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.type-deduction {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.type-desc {
  color: #374151;
  font-weight: 500;
}

.amount-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 8px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.amount-negative {
  color: #ef4444;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.amount-positive {
  color: #10b981;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}

.type-icon {
  margin-right: 6px;
  font-size: 14px;
}

.type-icon.recharge {
  color: #10b981;
}

.type-icon.deduction {
  color: #ef4444;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  min-width: 48px;
  box-sizing: border-box;
}

.status-badge.success {
  background: #d1fae5;
  color: #065f46;
}

/* 仅充值时：剩余额度进度条、批次状态 */
.remaining-cell {
  min-width: 120px;
  vertical-align: middle;
}
.remaining-compact {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.remaining-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.remaining-val {
  font-weight: 600;
  color: #374151;
}
.remaining-percent {
  color: #6b7280;
  font-size: 12px;
}
.remaining-progress-bg {
  width: 100%;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}
.remaining-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
}
.remaining-progress-fill.bar-empty {
  background: #9ca3af;
}
/* 已过期时：进度条展示「过期时剩余」金额，灰色样式 */
.remaining-progress-fill.bar-expired {
  background: linear-gradient(90deg, #9ca3af 0%, #6b7280 100%);
}
.remaining-at-expire-label {
  color: #6b7280;
}
.remaining-overdraft-tag {
  margin-bottom: 4px;
  align-self: flex-start;
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fecaca; /* 更亮的红色背景 */
  color: #ef4444;      /* 更鲜艳的红色文字 */
  font-size: 11px;
  font-weight: 500;
}
.remaining-cell .remaining-hint {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

.expire-cell {
  color: #374151;
  font-size: 13px;
  white-space: nowrap;
}
.text-gray {
  color: #9ca3af;
}

.batch-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  min-width: 64px;
  height: 26px;
  box-sizing: border-box;
}
.batch-status-active {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}
.batch-status-exhausted {
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}
.batch-status-expired {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

/* 状态列、批次状态列：保证不挤断文字 */
.col-status,
.col-batch-status {
  min-width: 76px;
  white-space: nowrap;
}

/* 优化表格布局 */
.detail-table th, .detail-table td {
  padding: 12px 16px;
  vertical-align: middle;
  font-size: 13px; /* 统一字体大小 */
}
.time-cell {
  white-space: nowrap;
  color: #4b5563;
}
.time-text {
  line-height: 1.4;
}
.type-cell {
  white-space: nowrap;
}
.type-desc {
  color: #374151;
  font-weight: 500;
}
.mono-font {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #6b7280;
}
.remarks-cell {
  max-width: 100px; /* 限制备注列宽度 */
  text-align: center;
}
.remarks-action {
  color: #3b82f6;
  cursor: pointer;
  font-weight: 500;
}
.remarks-action:hover {
  text-decoration: underline;
}
.remarks-text {
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 备注详情弹窗 */
.remarks-modal-content {
  max-width: 400px;
}
.remarks-detail-text {
  font-size: 14px;
  color: #374151;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  padding: 10px;
  background: #f9fafb;
  border-radius: 8px;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-content {
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  color: #6b7280;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.modal-close:hover {
  background: #f3f4f6;
  color: #111827;
}

.modal-body {
  padding: 24px;
}

.user-info-box {
  background: #eff6ff;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.info-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.info-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 20px;
  font-weight: 600;
}

.info-text {
  flex: 1;
  font-size: 14px;
  color: #1e40af;
  line-height: 1.5;
  /* 确保长文本不会撑开布局 */
  min-width: 0; /* 允许 flex 子元素收缩 */
  overflow: hidden;
}

.input-group {
  margin-bottom: 20px;
}

.input-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.amount-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.currency-symbol {
  position: absolute;
  left: 12px;
  font-size: 16px;
  color: #6b7280;
  font-weight: 600;
}

.amount-input {
  width: 100%;
  padding: 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  transition: all 0.2s;
}

.modal-select {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #374151;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input-group .checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
}
.input-group .modal-checkbox {
  width: 18px;
  height: 18px;
  accent-color: #3b82f6;
  cursor: pointer;
}
.input-group .date-input {
  display: block;
  margin-top: 10px;
  width: 100%;
  max-width: 220px;
  padding: 10px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #374151;
  background: #ffffff;
}
.input-group .date-input.date-input-full {
  max-width: none;
  cursor: pointer;
  box-sizing: border-box;
}
.input-group .date-input:focus {
  outline: none;
  border-color: #3b82f6;
}
.input-group .hint-text {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  color: #9ca3af;
}

/* 指定过期时间 - 日期选择器弹窗（撑满横轴 + 放大美观） */
.expire-time-group .date-picker-wrap {
  position: relative;
  width: 100%;
  margin-top: 10px;
}
.expire-date-picker-popup {
  position: absolute;
  left: 0;
  top: 100%;
  margin-top: 8px;
  z-index: 100;
  width: 100%;
  min-width: 300px;
  max-width: 360px;
  padding: 16px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid #e5e7eb;
}
.expire-date-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding: 4px 0;
}
.expire-date-nav {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: #f3f4f6;
  color: #374151;
  font-size: 20px;
  line-height: 1;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.expire-date-nav:hover {
  background: #e5e7eb;
  color: #111827;
}
.expire-date-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}
.expire-date-picker-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 8px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
}
.expire-date-picker-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  margin-bottom: 14px;
}
.expire-date-cell {
  aspect-ratio: 1;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  color: #374151;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.expire-date-cell:hover:not(.disabled):not(.other-month) {
  background: #eff6ff;
  color: #2563eb;
}
.expire-date-cell.other-month {
  color: #d1d5db;
}
.expire-date-cell.today {
  background: #f3f4f6;
  color: #111827;
  font-weight: 600;
}
.expire-date-cell.selected {
  background: #3b82f6;
  color: #fff;
}
.expire-date-cell.selected.today {
  background: #2563eb;
  color: #fff;
}
.expire-date-cell.disabled {
  color: #e5e7eb;
  cursor: not-allowed;
}
.expire-date-picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
}
.expire-date-btn {
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  border: none;
}
.expire-date-btn.secondary {
  background: #f3f4f6;
  color: #6b7280;
}
.expire-date-btn.secondary:hover {
  background: #e5e7eb;
  color: #374151;
}
.expire-date-btn.primary {
  background: #3b82f6;
  color: #fff;
}
.expire-date-btn.primary:hover {
  background: #2563eb;
}

.amount-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.quick-amounts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 12px;
  margin-bottom: 20px;
}
.input-group:has(.amount-input-wrapper) .quick-amounts {
  margin-bottom: 4px;
}

.quick-amount-btn {
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  color: #6b7280;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-amount-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
  background: #eff6ff;
}

.remarks-input {
  width: 100%;
  padding: 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  transition: all 0.2s;
}

.remarks-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.modal-footer {
  padding: 20px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn-cancel {
  padding: 10px 20px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  color: #6b7280;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #f3f4f6;
}

.btn-next {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #3b82f6;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-next:hover {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

/* 确认弹窗 */
.confirm-modal {
  max-width: 450px;
}

.warning-box {
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.confirm-modal-recharge .warning-box-recharge {
  background: #fee2e2;
  border-left: 4px solid #ef4444;
  display: flex;
  align-items: center;
  gap: 12px;
}

.confirm-modal-recharge .warning-box-recharge .warning-text {
  color: #991b1b;
}

.warning-box.danger {
  background: #fee2e2;
  border-left: 4px solid #ef4444;
  display: flex;
  align-items: center;
  gap: 12px;
}

.warning-box.danger .warning-text {
  color: #991b1b;
}

.warning-icon {
  font-size: 24px;
}

.warning-text {
  margin: 0;
  color: #92400e;
  font-size: 14px;
  line-height: 1.5;
}

.summary-box {
  background: #f9fafb;
  border-radius: 12px;
  padding: 20px;
}

.summary-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 16px 0;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #e5e7eb;
}

.summary-item:last-child {
  border-bottom: none;
}

.summary-label {
  font-size: 14px;
  color: #6b7280;
}

.summary-value {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

/* 用户名截断样式（仅应用于用户名，不影响金额） */
.summary-value.username-truncate-inline {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-confirm {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  margin-bottom: 12px;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

.btn-confirm-recharge {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
}

.btn-confirm-recharge:hover {
  box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
}

.btn-confirm:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
}

.btn-confirm.danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
}

.btn-confirm.danger:hover {
  box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
}

.btn-back {
  width: 100%;
  padding: 10px;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 14px;
  cursor: pointer;
  text-decoration: underline;
  transition: color 0.2s;
}

.btn-back:hover {
  color: #111827;
}

/* 成功提示 */
.success-toast {
  position: fixed;
  bottom: 24px;
  left: 24px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
  display: flex;
  align-items: center;
  gap: 12px;
  color: white;
  z-index: 2000;
  min-width: 300px;
  animation: slideInLeft 0.3s ease;
}

@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.toast-slide-leave-active {
  animation: slideOutLeft 0.3s ease;
}

@keyframes slideOutLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}

.toast-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
}

.toast-content {
  flex: 1;
}

.toast-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.toast-message {
  font-size: 14px;
  opacity: 0.95;
  margin-bottom: 4px;
  /* 确保长文本不会撑开布局 */
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.toast-time {
  font-size: 12px;
  opacity: 0.8;
}

/* 复制提示 */
.copy-toast {
  position: fixed;
  bottom: 24px;
  left: 24px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 12px;
  padding: 12px 18px;
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
  display: flex;
  align-items: center;
  gap: 10px;
  color: white;
  z-index: 2000;
  min-width: 200px;
  animation: slideInLeft 0.3s ease;
}

.copy-toast .toast-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.copy-toast .toast-content {
  flex: 1;
}

.copy-toast .toast-message {
  font-size: 14px;
  font-weight: 500;
  opacity: 0.95;
}

.loading-state {
  text-align: center;
  padding: 60px;
  color: white;
  font-size: 18px;
}

/* 确保 ECharts 图表及 tooltip 不被裁剪、始终可见 */
.chart-container :deep(div[class*="echarts"]) {
  overflow: visible !important;
}

:deep(.echarts-tooltip) {
  z-index: 99999 !important;
  pointer-events: none;
}
</style>
