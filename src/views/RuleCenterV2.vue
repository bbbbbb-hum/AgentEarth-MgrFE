<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { authorizedFetch } from '../http';

type Frequency = 'monthly' | 'weekly' | 'daily';
type TriggerMode = 'cron' | 'event';
type UserStatus = 'active' | 'inactive' | 'suspended';
type ActionKind = 'recharge';
type ExpireStrategy = 'month_end' | 'fixed_30_days' | 'never' | 'custom_date';

interface RuleItem {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  cron_expression: string;
  filter_config: string;
  action_config: string;
  last_exec_time?: string;
}

interface DashboardResp {
  running_rules: number;
  monthly_touched_users: number;
  monthly_auto_points: number;
}

interface RunItem {
  run_time: string;
  charge_source: number;
  exec_source: string;
  total_count: number;
  success_count: number;
  failed_count: number;
}

interface DetailItem {
  trigger_time: string;
  exec_source: string;
  user_id: string;
  user_name: string;
  operator: string;
  change_amount: number;
  status: string;
}

const list = ref<RuleItem[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const search = ref('');
const loading = ref(false);
const stats = ref<DashboardResp>({ running_rules: 0, monthly_touched_users: 0, monthly_auto_points: 0 });

const showEditor = ref(false);
const saving = ref(false);
const step = ref(1);

const form = ref({
  id: 0,
  name: '',
  description: '',
  is_active: true,
  triggerMode: 'cron' as TriggerMode,
  frequency: 'monthly' as Frequency,
  dayOfMonth: 1,
  dayOfWeek: 1,
  execTime: '17:43',
  eventSource: 'user_registered',
  statuses: ['active'] as UserStatus[],
  minRegDays: 0,
  maxRegDays: 0,
  lastLoginWithinDays: 0,
  minLastMonthConsume: 0,
  maxLastMonthConsume: 0,
  minBalance: -1,
  maxBalance: -1,
  minHistoryRecharge: 0,
  maxHistoryRecharge: 0,
  regChannel: '',
  actionKind: 'recharge' as ActionKind,
  actionAmount: 5000,
  expireStrategy: 'month_end' as ExpireStrategy,
  customExpireDate: ''
});

const showRecon = ref(false);
const showDeleteModal = ref(false);
const deleteTarget = ref<RuleItem | null>(null);
const reconRule = ref<RuleItem | null>(null);
const runLoading = ref(false);
const detailLoading = ref(false);
const runs = ref<RunItem[]>([]);
const selectedRun = ref<RunItem | null>(null);
const details = ref<DetailItem[]>([]);

const cronPreview = computed(() => {
  const [h, m] = form.value.execTime.split(':').map(v => Number(v || 0));
  if (form.value.frequency === 'daily') return `${m} ${h} * * *`;
  if (form.value.frequency === 'weekly') return `${m} ${h} * * ${form.value.dayOfWeek}`;
  return `${m} ${h} ${form.value.dayOfMonth} * *`;
});

const runSummary = computed(() => {
  const runCount = runs.value.length;
  let successCount = 0;
  let failedCount = 0;
  for (const r of runs.value) {
    successCount += r.success_count;
    failedCount += r.failed_count;
  }
  return { runCount, successCount, failedCount };
});

const fmt = (n: number) => Number(n || 0).toLocaleString('zh-CN');
const sourceText = (v: string) => (v === 'manual' ? '手动' : '自动');

const parseAmountText = (cfg: string) => {
  try {
    const c = JSON.parse(cfg || '{}');

    // 新版：从 actions 数组中取第一个 recharge 动作
    let amount = 0;
    let type = 'add_points';
    if (Array.isArray(c.actions) && c.actions.length > 0) {
      const first = c.actions.find((a: any) => a.action_type === 'recharge') || c.actions[0];
      const body = first.action_body || {};
      amount = Number(body.amount || 0);
      type = first.action_type || 'recharge';
    } else {
      // 兼容旧版：顶层 type/amount
      amount = Number(c.amount || 0);
      type = c.type || 'add_points';
    }

    const sign = type === 'deduct_points' ? '-' : '+';
    return `${sign} ${Number(amount || 0).toLocaleString('zh-CN')}`;
  } catch {
    return '-';
  }
};

const parseAmountClass = (cfg: string) => {
  try {
    return JSON.parse(cfg || '{}').type === 'deduct_points' ? 'neg' : 'pos';
  } catch {
    return 'pos';
  }
};

const fetchStats = async () => {
  const resp = await authorizedFetch('api/rules/dashboard', { method: 'GET' });
  stats.value = await resp.json();
};

const fetchList = async () => {
  loading.value = true;
  try {
    const q = new URLSearchParams({
      page: String(page.value),
      size: String(size.value),
      search: search.value.trim()
    });
    const resp = await authorizedFetch(`api/rules/list?${q.toString()}`, { method: 'GET' });
    const data = await resp.json();
    list.value = data.list || [];
    total.value = data.total || 0;
  } finally {
    loading.value = false;
  }
};

const useRegLimit = ref(false);
const useLoginLimit = ref(false);
const useConsumeLimit = ref(false);
const useBalanceLimit = ref(false);

const resetForm = () => {
  form.value = {
    id: 0,
    name: '',
    description: '',
    is_active: true,
    triggerMode: 'cron',
    frequency: 'monthly',
    dayOfMonth: 1,
    dayOfWeek: 1,
    execTime: '17:43',
    eventSource: 'user_registered',
    statuses: ['active'],
    minRegDays: 0,
    maxRegDays: 0,
    lastLoginWithinDays: 0,
    minLastMonthConsume: 0,
    maxLastMonthConsume: 0,
    minBalance: -1,
    maxBalance: -1,
    minHistoryRecharge: 0,
    maxHistoryRecharge: 0,
    regChannel: '',
    actionKind: 'recharge',
    actionAmount: 5000,
    expireStrategy: 'month_end',
    customExpireDate: ''
  };
  useRegLimit.value = false;
  useLoginLimit.value = false;
  useConsumeLimit.value = false;
  useBalanceLimit.value = false;
  step.value = 1;
};

const parseRuleForEdit = (item: RuleItem) => {
  form.value.id = item.id;
  form.value.name = item.name;
  form.value.description = item.description || '';
  form.value.is_active = item.is_active;

  const p = (item.cron_expression || '').trim().split(/\s+/);
  if (p.length === 5) {
    form.value.execTime = `${String(Number(p[1] || 0)).padStart(2, '0')}:${String(Number(p[0] || 0)).padStart(2, '0')}`;
    if (p[2] !== '*' && p[4] === '*') {
      form.value.frequency = 'monthly';
      form.value.dayOfMonth = Number(p[2]) || 1;
    } else if (p[2] === '*' && p[4] !== '*') {
      form.value.frequency = 'weekly';
      form.value.dayOfWeek = Number(p[4]) || 1;
    } else {
      form.value.frequency = 'daily';
    }
  }

  try {
    const fc = JSON.parse(item.filter_config || '{}');
    form.value.statuses = Array.isArray(fc.status) && fc.status.length ? fc.status : ['active'];
    form.value.minRegDays = Number(fc.min_reg_days || 0);
    form.value.maxRegDays = Number(fc.max_reg_days || 0);
    form.value.lastLoginWithinDays = Number(fc.last_login_within_days || 0);
    form.value.minLastMonthConsume = Number(fc.min_last_month_consume || 0);
    form.value.maxLastMonthConsume = Number(fc.max_last_month_consume || 0);
    const mb = Number(fc.min_balance);
    const mxb = Number(fc.max_balance);
    form.value.minBalance = typeof fc.min_balance === 'number' && fc.min_balance >= 0 ? mb : -1;
    form.value.maxBalance = typeof fc.max_balance === 'number' && fc.max_balance >= 0 ? mxb : -1;
    form.value.regChannel = typeof fc.reg_channel === 'string' ? fc.reg_channel : '';
    form.value.minHistoryRecharge = Number(fc.min_history_recharge || 0);
    form.value.maxHistoryRecharge = Number(fc.max_history_recharge || 0);

    useRegLimit.value = form.value.minRegDays > 0 || form.value.maxRegDays > 0;
    useLoginLimit.value = form.value.lastLoginWithinDays > 0;
    useConsumeLimit.value = form.value.minLastMonthConsume > 0 || form.value.maxLastMonthConsume > 0;
    useBalanceLimit.value = form.value.minBalance >= 0 || form.value.maxBalance >= 0;
  } catch {
    form.value.statuses = ['active'];
    form.value.minRegDays = 0;
    form.value.maxRegDays = 0;
    form.value.lastLoginWithinDays = 0;
    form.value.minLastMonthConsume = 0;
    form.value.maxLastMonthConsume = 0;
    form.value.minBalance = -1;
    form.value.maxBalance = -1;
    form.value.minHistoryRecharge = 0;
    form.value.maxHistoryRecharge = 0;
    form.value.regChannel = '';
    useRegLimit.value = false;
    useLoginLimit.value = false;
    useConsumeLimit.value = false;
    useBalanceLimit.value = false;
  }

  try {
    const ac = JSON.parse(item.action_config || '{}');
    form.value.actionKind = 'recharge';
    form.value.customExpireDate = '';

    // 新版结构：{ actions:[{ action_type, action_body:{ amount, expire_strategy, ... } }] }
    let amount = 5000;
    let strategy = 'month_end';
    if (Array.isArray(ac.actions) && ac.actions.length > 0) {
      let first = ac.actions.find((a: any) => a.action_type === 'recharge') || ac.actions[0];
      const body = first.action_body || {};
      amount = Number(body.amount || 5000);
      strategy = String(body.expire_strategy || '').trim();
    } else {
      // 兼容旧格式：{ type, amount, expire_strategy }
      amount = Number(ac.amount || 5000);
      strategy = String(ac.expire_strategy || '').trim();
    }

    form.value.actionAmount = amount;
    if (strategy === 'fixed_30_days') {
      form.value.expireStrategy = 'fixed_30_days';
    } else if (strategy === 'never') {
      form.value.expireStrategy = 'never';
    } else if (strategy === 'month_end' || !strategy) {
      form.value.expireStrategy = 'month_end';
    } else if (strategy.startsWith('date:')) {
      form.value.expireStrategy = 'custom_date';
      form.value.customExpireDate = strategy.slice(5);
    } else {
      form.value.expireStrategy = 'month_end';
    }
  } catch {
    form.value.actionKind = 'recharge';
    form.value.actionAmount = 5000;
    form.value.expireStrategy = 'month_end';
    form.value.customExpireDate = '';
  }
};

// --- Filter Logic ---
const filterTypes = [
  { id: 'reg_time', label: '注册时间限制', icon: '📅' },
  { id: 'last_login', label: '活跃度限制 (最后登录)', icon: '📈' },
  { id: 'last_month_consume', label: '上月消费金额', icon: '👛' },
  { id: 'balance', label: '当前账户余额', icon: '💳' },
  { id: 'reg_channel', label: '注册渠道', icon: '🔗' },
  { id: 'history_recharge', label: '历史累计充值', icon: '💰' }
];

const activeFilters = ref<any[]>([]);

// 受众预览：当前筛选条件将命中的用户（全部拉取并展示）
const audiencePreviewTotal = ref(0);
const audiencePreviewList = ref<{ user_id: string; username: string }[]>([]);
const audiencePreviewLoading = ref(false);
const audiencePreviewError = ref('');

const getFilterIcon = (type: string) => filterTypes.find(t => t.id === type)?.icon || '🔧';
const getFilterLabel = (type: string) => filterTypes.find(t => t.id === type)?.label || type;

const hasFilter = (type: string) => activeFilters.value.some(f => f.type === type);

const validateFilterRange = (f: any) => {
  f.error = '';
  const normalize = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));

  // 注册时间限制：min/max 都为 0 或空时，表示“不限”，不报错；
  // 只有两个值都 >0 且 max < min 时才提示错误。
  if (f.type === 'reg_time') {
    let min = normalize(f.min);
    let max = normalize(f.max);
    if (min !== null && min <= 0) min = null;
    if (max !== null && max <= 0) max = null;
    if (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && max < min) {
      f.error = '区间不合法：上限不能小于下限';
    }
    return;
  }

  // 金额类区间：上月消费 / 当前余额 / 历史累计充值。
  if (['last_month_consume', 'balance', 'history_recharge'].includes(f.type)) {
    const min = normalize(f.min);
    const max = normalize(f.max);
    if (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && max < min) {
      f.error = '区间不合法：上限不能小于下限';
    }
  }
};

const validateAllFilters = () => {
  for (const f of activeFilters.value) {
    validateFilterRange(f);
  }
  return !activeFilters.value.some(f => f.error);
};

const addFilter = (type: string) => {
  if (hasFilter(type)) return;
  const f: any = { type };
  // Defaults
  if (type === 'reg_time') { f.min = 30; f.max = null; }
  else if (type === 'last_login') { f.days = 7; }
  else if (type === 'last_month_consume') { f.min = 100; f.max = null; }
  else if (type === 'balance') { f.min = 0; f.max = null; }
  else if (type === 'reg_channel') { f.channel = 'local'; }
  else if (type === 'history_recharge') { f.min = 100; f.max = null; }
   validateFilterRange(f);
  activeFilters.value.push(f);
};

const removeFilter = (idx: number) => {
  activeFilters.value.splice(idx, 1);
};

// 从 activeFilters 构建与后端 AudiencePreviewReq 一致的请求体（与 saveRule 的筛选映射一致）
function buildAudiencePreviewPayload() {
  const payload: Record<string, number | string> = {
    min_reg_days: 0,
    max_reg_days: 0,
    last_login_within_days: 0,
    min_last_month_consume: 0,
    max_last_month_consume: 0,
    min_balance: -1,
    max_balance: -1,
    reg_channel: '',
    min_history_recharge: 0,
    max_history_recharge: 0,
  };
  for (const f of activeFilters.value) {
    if (f.type === 'reg_time') {
      payload.min_reg_days = f.min ?? 0;
      payload.max_reg_days = f.max ?? 0;
    } else if (f.type === 'last_login') {
      payload.last_login_within_days = f.days ?? 0;
    } else if (f.type === 'last_month_consume') {
      payload.min_last_month_consume = f.min ?? 0;
      payload.max_last_month_consume = f.max ?? 0;
    } else if (f.type === 'balance') {
      payload.min_balance = f.min >= 0 ? f.min : -1;
      payload.max_balance = f.max >= 0 ? f.max : -1;
    } else if (f.type === 'reg_channel') {
      payload.reg_channel = (f.channel || '').trim();
    } else if (f.type === 'history_recharge') {
      payload.min_history_recharge = f.min ?? 0;
      payload.max_history_recharge = f.max ?? 0;
    }
  }
  return payload;
}

// 拉取受众预览：分页请求直到拿到全部用户并展示
async function fetchAudiencePreview() {
  audiencePreviewLoading.value = true;
  audiencePreviewError.value = '';
  audiencePreviewTotal.value = 0;
  audiencePreviewList.value = [];
  try {
    const payload = buildAudiencePreviewPayload();
    const pageSize = 500;
    let page = 1;
    let total = 0;
    const all: { user_id: string; username: string }[] = [];
    do {
      const resp = await authorizedFetch('api/rules/audience-preview', {
        method: 'POST',
        body: JSON.stringify({ ...payload, page, size: pageSize }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      total = data.total ?? 0;
      const list = data.list ?? [];
      all.push(...list);
      if (list.length < pageSize || all.length >= total) break;
      page += 1;
    } while (true);
    audiencePreviewTotal.value = total;
    audiencePreviewList.value = all;
  } catch (e) {
    audiencePreviewError.value = e instanceof Error ? e.message : '预览失败';
  } finally {
    audiencePreviewLoading.value = false;
  }
}

let audiencePreviewDebounceId: ReturnType<typeof setTimeout> | null = null;
function debouncedAudiencePreview() {
  if (audiencePreviewDebounceId) clearTimeout(audiencePreviewDebounceId);
  audiencePreviewDebounceId = setTimeout(() => {
    audiencePreviewDebounceId = null;
    if (step.value === 3) fetchAudiencePreview();
  }, 450);
}

watch(
  () => [step.value, activeFilters.value] as const,
  () => {
    if (step.value === 3) debouncedAudiencePreview();
  },
  { deep: true }
);

// --------------------

const openCreate = () => {
  resetForm();
  activeFilters.value = [];
  showEditor.value = true;
};

const openEdit = (item: RuleItem) => {
  resetForm();
  activeFilters.value = [];
  parseRuleForEdit(item);
  // Reconstruct activeFilters from form values (which were populated from filter_config)
  if (form.value.minRegDays > 0 || form.value.maxRegDays > 0) {
    activeFilters.value.push({ type: 'reg_time', min: form.value.minRegDays, max: form.value.maxRegDays || null });
  }
  if (form.value.lastLoginWithinDays > 0) {
    activeFilters.value.push({ type: 'last_login', days: form.value.lastLoginWithinDays });
  }
  if (form.value.minLastMonthConsume > 0 || form.value.maxLastMonthConsume > 0) {
    activeFilters.value.push({ type: 'last_month_consume', min: form.value.minLastMonthConsume, max: form.value.maxLastMonthConsume || null });
  }
  if (form.value.minBalance >= 0 || form.value.maxBalance >= 0) {
    activeFilters.value.push({ type: 'balance', min: form.value.minBalance >= 0 ? form.value.minBalance : null, max: form.value.maxBalance >= 0 ? form.value.maxBalance : null });
  }
  if (form.value.regChannel) {
    activeFilters.value.push({ type: 'reg_channel', channel: form.value.regChannel });
  }
  if (form.value.minHistoryRecharge > 0 || form.value.maxHistoryRecharge > 0) {
    activeFilters.value.push({ type: 'history_recharge', min: form.value.minHistoryRecharge, max: form.value.maxHistoryRecharge || null });
  }
  // Try to parse other filters from raw filter_config if any
  try {
    const fc = JSON.parse(item.filter_config || '{}');
    if (fc.filters && Array.isArray(fc.filters)) {
      // Merge other filters that are not mapped to form fields
      for (const f of fc.filters) {
        if (!['reg_time', 'last_login', 'last_month_consume', 'balance', 'history_recharge'].includes(f.type)) {
          activeFilters.value.push(f);
        }
      }
    }
  } catch {}

  showEditor.value = true;
};

const nextStep = () => {
  if (step.value < 4) step.value += 1;
};

const prevStep = () => {
  if (step.value > 1) step.value -= 1;
};

const toggleStatus = (s: UserStatus) => {
  if (form.value.statuses.includes(s)) {
    form.value.statuses = form.value.statuses.filter(v => v !== s);
  } else {
    form.value.statuses = [...form.value.statuses, s];
  }
  if (!form.value.statuses.length) form.value.statuses = ['active'];
};


const saveRule = async () => {
  saving.value = true;
  try {
    if (!validateAllFilters()) {
      saving.value = false;
      return;
    }
    let expire: string;
    if (form.value.expireStrategy === 'fixed_30_days') {
      expire = 'fixed_30_days';
    } else if (form.value.expireStrategy === 'custom_date') {
      const d = (form.value.customExpireDate || '').trim();
      expire = d ? `date:${d}` : 'never';
    } else {
      expire = form.value.expireStrategy;
    }
    const actionType = 'recharge';

    // Map activeFilters to form fields for backend compatibility
    form.value.minRegDays = 0;
    form.value.maxRegDays = 0;
    form.value.lastLoginWithinDays = 0;
    form.value.minLastMonthConsume = 0;
    form.value.maxLastMonthConsume = 0;
    form.value.minBalance = -1;
    form.value.maxBalance = -1;
    form.value.regChannel = '';
  form.value.minHistoryRecharge = 0;
  form.value.maxHistoryRecharge = 0;

    for (const f of activeFilters.value) {
      if (f.type === 'reg_time') {
        form.value.minRegDays = f.min || 0;
        form.value.maxRegDays = f.max || 0;
      } else if (f.type === 'last_login') {
        form.value.lastLoginWithinDays = f.days || 0;
      } else if (f.type === 'last_month_consume') {
        form.value.minLastMonthConsume = typeof f.min === 'number' ? f.min : 0;
        form.value.maxLastMonthConsume = typeof f.max === 'number' ? f.max : 0;
      } else if (f.type === 'balance') {
        form.value.minBalance = typeof f.min === 'number' && f.min >= 0 ? f.min : -1;
        form.value.maxBalance = typeof f.max === 'number' && f.max >= 0 ? f.max : -1;
      } else if (f.type === 'reg_channel') {
        form.value.regChannel = (f.channel || '').trim();
      } else if (f.type === 'history_recharge') {
        form.value.minHistoryRecharge = typeof f.min === 'number' ? f.min : 0;
        form.value.maxHistoryRecharge = typeof f.max === 'number' ? f.max : 0;
      }
    }

    await authorizedFetch('api/rules/save', {
      method: 'POST',
      body: JSON.stringify({
        id: form.value.id,
        name: form.value.name.trim(),
        description: form.value.description.trim(),
        is_active: form.value.is_active,
        frequency: form.value.frequency,
        day_of_month: form.value.dayOfMonth,
        day_of_week: form.value.dayOfWeek,
        exec_time: form.value.execTime,
        target_statuses: form.value.statuses,
        min_reg_days: form.value.minRegDays,
        max_reg_days: form.value.maxRegDays,
        last_login_within_days: form.value.lastLoginWithinDays,
        min_last_month_consume: form.value.minLastMonthConsume,
        max_last_month_consume: form.value.maxLastMonthConsume,
        min_balance: form.value.minBalance >= 0 ? form.value.minBalance : -1,
        max_balance: form.value.maxBalance >= 0 ? form.value.maxBalance : -1,
        reg_channel: form.value.regChannel,
        min_history_recharge: Number(form.value.minHistoryRecharge || 0),
        max_history_recharge: Number(form.value.maxHistoryRecharge || 0),
        // Also save the full filter list for future use/UI restore
        filters: activeFilters.value,
        action_type: actionType,
        action_amount: form.value.actionAmount,
        expire_strategy: expire
      })
    });
    showEditor.value = false;
    await Promise.all([fetchStats(), fetchList()]);
  } finally {
    saving.value = false;
  }
};

const toggleRule = async (item: RuleItem) => {
  const next = !item.is_active;
  item.is_active = next;
  try {
    await authorizedFetch('api/rules/toggle', {
      method: 'POST',
      body: JSON.stringify({ id: item.id, is_active: next })
    });
    await fetchStats();
  } catch {
    item.is_active = !next;
  }
};

const manualRun = async (item: RuleItem) => {
  await authorizedFetch('api/rules/manual-run', {
    method: 'POST',
    body: JSON.stringify({ rule_id: item.id })
  });
  await fetchList();
};

const deleteRule = (item: RuleItem) => {
  deleteTarget.value = item;
  showDeleteModal.value = true;
};

const confirmDelete = async () => {
  if (!deleteTarget.value) return;
  try {
    await authorizedFetch('api/rules/delete', {
      method: 'POST',
      body: JSON.stringify({ id: deleteTarget.value.id })
    });
    showDeleteModal.value = false;
    await Promise.all([fetchStats(), fetchList()]);
  } catch (e) {
    console.error(e);
  }
};

const changePage = (delta: number) => {
  const next = page.value + delta;
  if (next <= 0 || (total.value && next > Math.ceil(total.value / size.value))) return;
  page.value = next;
  fetchList();
};

const openRecon = async (rule: RuleItem) => {
  showRecon.value = true;
  reconRule.value = rule;
  runs.value = [];
  details.value = [];
  selectedRun.value = null;
  runLoading.value = true;
  try {
    const q = new URLSearchParams({ rule_id: String(rule.id), page: '1', size: '200' });
    const resp = await authorizedFetch(`api/rules/execution/runs?${q.toString()}`, { method: 'GET' });
    const data = await resp.json();
    runs.value = data.list || [];
    if (runs.value.length > 0) await selectRun(runs.value[0]);
  } finally {
    runLoading.value = false;
  }
};

const selectRun = async (run: RunItem) => {
  selectedRun.value = run;
  detailLoading.value = true;
  try {
    const q = new URLSearchParams({
      rule_id: String(reconRule.value?.id || 0),
      run_time: run.run_time,
      charge_source: String(run.charge_source)
    });
    const resp = await authorizedFetch(`api/rules/execution/details?${q.toString()}`, { method: 'GET' });
    const data = await resp.json();
    details.value = data.list || [];
  } finally {
    detailLoading.value = false;
  }
};

onMounted(async () => {
  await Promise.all([fetchStats(), fetchList()]);
});
</script>

<template>
  <div class="rule-page">
    <div class="head">
      <div class="title-block">
        <div class="title-cn">星量自动充值规则配置列表</div>
      </div>
      <button class="create-btn" @click="openCreate">＋ 新增资金规则</button>
    </div>

    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">运行中规则数</div>
        <div class="stat-num">{{ fmt(stats.running_rules) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">本月触达用户</div>
        <div class="stat-num indigo">{{ fmt(stats.monthly_touched_users) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">本月自动赠送 (点数)</div>
        <div class="stat-num orange">{{ fmt(stats.monthly_auto_points) }}</div>
      </div>
    </div>

    <div class="list-card">
      <div class="list-head">
        <div class="lh-left">
          <div class="list-title">规则管理列表</div>
          <div class="list-sub">共 {{ total }} 条规则</div>
        </div>
        <div class="lh-right">
          <div class="search-wrap">
            <input v-model="search" placeholder="按规则名称搜索" @keyup.enter="fetchList" />
            <button v-if="search" type="button" class="search-clear" @click="search = ''; fetchList()" title="清空">×</button>
          </div>
          <button @click="fetchList">搜索</button>
        </div>
      </div>

      <table class="rule-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>规则名称</th>
            <th>触发条件</th>
            <th>变动金额</th>
            <th>状态</th>
            <th>对账与操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="empty">加载中...</td>
          </tr>
          <tr v-else-if="!list.length">
            <td colspan="6" class="empty">暂无规则</td>
          </tr>
          <tr v-else v-for="item in list" :key="item.id">
            <td>{{ item.id }}</td>
            <td>
              <div class="rname">{{ item.name }}</div>
              <div class="rdesc">{{ item.description || '-' }}</div>
            </td>
            <td><span class="chip">定时执行 (Cron)</span>{{ item.cron_expression }}</td>
            <td><span :class="parseAmountClass(item.action_config)">{{ parseAmountText(item.action_config) }}</span></td>
            <td>
              <label class="switch">
                <input type="checkbox" :checked="item.is_active" @change="toggleRule(item)" />
                <span class="slider"></span>
              </label>
            </td>
            <td>
              <button class="op op-run" @click="manualRun(item)">手动执行</button>
              <button class="op op-detail" @click="openRecon(item)">对账明细</button>
              <button class="op-link" @click="openEdit(item)">编辑</button>
              <button class="op-link danger" @click="deleteRule(item)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="pager">
        <button :disabled="page === 1" @click="changePage(-1)">上一页</button>
        <span>第 {{ page }} 页</span>
        <button :disabled="page * size >= total" @click="changePage(1)">下一页</button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showEditor" class="modal-mask" @click.self="showEditor = false">
        <div class="wizard-modal">
          <div class="wm-head">
            <h3>创建自动化规则</h3>
            <button class="close-x" @click="showEditor = false">×</button>
          </div>

          <div class="wm-body">
          <aside class="stepper">
            <div class="sitem" :class="{ active: step >= 1, done: step > 1 }">
              <div class="dot">{{ step > 1 ? '✓' : '1' }}</div>
              <div><div class="st">基础信息</div><div class="sd">命名与描述</div></div>
            </div>
            <div class="sitem" :class="{ active: step >= 2, done: step > 2 }">
              <div class="dot">{{ step > 2 ? '✓' : '2' }}</div>
              <div><div class="st">触发机制 (Trigger)</div><div class="sd">何时执行</div></div>
            </div>
            <div class="sitem" :class="{ active: step >= 3, done: step > 3 }">
              <div class="dot">{{ step > 3 ? '✓' : '3' }}</div>
              <div><div class="st">受众筛选 (Filter)</div><div class="sd">针对谁</div></div>
            </div>
            <div class="sitem" :class="{ active: step >= 4 }">
              <div class="dot">4</div>
              <div><div class="st">执行动作 (Action)</div><div class="sd">做什么</div></div>
            </div>
          </aside>

            <main class="content">
              <section v-if="step === 1" class="step-panel">
                <div class="step-title"><span class="badge">1</span> 基础信息 (Basic)</div>
                <div class="form-grid one">
                  <label>规则名称<input v-model="form.name" placeholder="例如：每月普惠赠送" /></label>
                  <label>规则描述<input v-model="form.description" placeholder="备注信息" /></label>
                  <label class="inline-check"><input v-model="form.is_active" type="checkbox" /> 立即启用</label>
                </div>
              </section>

              <section v-if="step === 2" class="step-panel">
                <div class="step-title"><span class="badge purple">2</span> 配置触发器 (Trigger)</div>

                <div class="cron-box">
                  <div class="lb">执行频率</div>
                  <div class="seg">
                    <button :class="{ on: form.frequency === 'monthly' }" @click="form.frequency = 'monthly'">每月</button>
                    <button :class="{ on: form.frequency === 'weekly' }" @click="form.frequency = 'weekly'">每周</button>
                    <button :class="{ on: form.frequency === 'daily' }" @click="form.frequency = 'daily'">每日</button>
                  </div>
                  <div class="lb mt12">详细时间</div>
                  <div class="cron-line">
                    <div v-if="form.frequency === 'monthly'" class="small-input">
                      <input v-model.number="form.dayOfMonth" type="number" min="1" max="28" />
                      <span>日</span>
                    </div>
                    <div v-if="form.frequency === 'weekly'" class="small-input">
                      <select v-model.number="form.dayOfWeek">
                        <option :value="1">周一</option><option :value="2">周二</option><option :value="3">周三</option>
                        <option :value="4">周四</option><option :value="5">周五</option><option :value="6">周六</option><option :value="0">周日</option>
                      </select>
                    </div>
                    <input class="time-input" v-model="form.execTime" type="time" />
                  </div>
                  <div class="preview">Generated Expression: {{ cronPreview }}</div>
                </div>
              </section>

              <section v-if="step === 3" class="step-panel">
                <div class="step-title"><span class="badge yellow">3</span> 受众筛选 (Audience Filter)</div>
                <div class="filter-container">
                  <div class="fc-head">当满足以下 <strong>所有</strong> 条件时执行:</div>

                  <!-- Active Filters List -->
                  <div class="active-filters">
                    <div v-for="(f, idx) in activeFilters" :key="f.type" class="filter-card">
                      <div class="fc-title">
                        <div class="fc-left">
                          <span class="fc-icon">{{ getFilterIcon(f.type) }}</span>
                          <span>{{ getFilterLabel(f.type) }}</span>
                        </div>
                        <button class="fc-del" @click="removeFilter(idx)">🗑️</button>
                      </div>
                      <div class="fc-content">
                        <!-- Conditional Inputs based on f.type -->
                        <div v-if="f.type === 'reg_time'" class="fc-inputs">
                          <span class="sep">|</span>
                          <span>注册时间超过</span>
                          <input v-model.number="f.min" type="number" class="input-sm" placeholder="0" @blur="validateFilterRange(f)" />
                          <span>天，且不足</span>
                          <input v-model.number="f.max" type="number" class="input-sm" placeholder="不限" @blur="validateFilterRange(f)" />
                          <span>天</span>
                          <span v-if="f.error" class="fc-error">{{ f.error }}</span>
                        </div>
                        <div v-else-if="f.type === 'last_login'" class="fc-inputs">
                           <span class="sep">|</span>
                           <span>最近</span>
                           <input v-model.number="f.days" type="number" class="input-sm" />
                           <span>天内有登录行为</span>
                        </div>
                        <div v-else-if="f.type === 'last_month_consume'" class="fc-inputs">
                           <span class="sep">|</span>
                           <span>金额介于</span>
                           <input v-model.number="f.min" type="number" class="input-md" placeholder="不限" @blur="validateFilterRange(f)" />
                           <span>至</span>
                           <input v-model.number="f.max" type="number" class="input-md" placeholder="不限" @blur="validateFilterRange(f)" />
                           <span>元之间</span>
                           <span v-if="f.error" class="fc-error">{{ f.error }}</span>
                        </div>
                        <div v-else-if="f.type === 'balance'" class="fc-inputs">
                           <span class="sep">|</span>
                           <span>余额介于</span>
                           <input v-model.number="f.min" type="number" class="input-md" placeholder="不限" @blur="validateFilterRange(f)" />
                           <span>至</span>
                           <input v-model.number="f.max" type="number" class="input-md" placeholder="不限" @blur="validateFilterRange(f)" />
                           <span>元之间</span>
                           <span v-if="f.error" class="fc-error">{{ f.error }}</span>
                        </div>
                        <div v-else-if="f.type === 'reg_channel'" class="fc-inputs">
                           <span class="sep">|</span>
                           <span>注册渠道为</span>
                           <select v-model="f.channel">
                             <option value="local">Local</option>
                             <option value="google">Google</option>
                             <option value="github">GitHub</option>
                           </select>
                        </div>
                        <div v-else-if="f.type === 'history_recharge'" class="fc-inputs">
                           <span class="sep">|</span>
                           <span>累计充值</span>
                           <input v-model.number="f.min" type="number" class="input-md" placeholder="不限" @blur="validateFilterRange(f)" />
                           <span>至</span>
                           <input v-model.number="f.max" type="number" class="input-md" placeholder="不限" @blur="validateFilterRange(f)" />
                           <span>元之间</span>
                           <span v-if="f.error" class="fc-error">{{ f.error }}</span>
                        </div>
                        <!-- Fallback for other types -->
                        <div v-else class="fc-inputs">
                          <span class="sep">|</span>
                          <span class="text-gray">暂无配置项</span>
                        </div>
                      </div>
                    </div>
                    <div v-if="activeFilters.length === 0" class="no-filters">
                      暂无筛选条件，将对所有用户生效
                    </div>
                  </div>

                  <!-- Add Filter Buttons -->
                  <div class="add-filter-area">
                    <div class="af-label">添加新筛选条件</div>
                    <div class="af-list">
                      <button v-for="ft in filterTypes" :key="ft.id" class="af-btn" @click="addFilter(ft.id)" :disabled="hasFilter(ft.id)">
                        <span class="af-icon">{{ ft.icon }}</span> {{ ft.label }} <span class="plus">+</span>
                      </button>
                    </div>
                  </div>

                  <!-- 受众预览：实时展示当前条件将作用的全部用户 -->
                  <div class="audience-preview-area">
                    <div class="ap-title">👥 受众预览</div>
                    <p v-if="audiencePreviewLoading" class="ap-msg">正在计算命中用户…</p>
                    <p v-else-if="audiencePreviewError" class="ap-msg ap-error">{{ audiencePreviewError }}</p>
                    <p v-else-if="activeFilters.length === 0" class="ap-msg ap-hint">添加筛选条件后将显示将作用的用户</p>
                    <template v-else>
                      <p class="ap-msg ap-total">当前条件将作用于 <strong>{{ audiencePreviewTotal }}</strong> 个用户</p>
                      <div v-if="audiencePreviewList.length > 0" class="ap-table-wrap">
                        <table class="ap-table">
                          <thead>
                            <tr>
                              <th class="ap-col-num">序号</th>
                              <th class="ap-col-id">用户 ID</th>
                              <th class="ap-col-name">用户名</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(u, i) in audiencePreviewList" :key="u.user_id">
                              <td class="ap-col-num">{{ i + 1 }}</td>
                              <td class="ap-col-id" :title="u.user_id">
                                <span class="ap-cell-truncate">{{ u.user_id }}</span>
                              </td>
                              <td class="ap-col-name" :title="u.username || '-'">
                                <span class="ap-cell-truncate">{{ u.username || '-' }}</span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </template>
                  </div>
                </div>
              </section>

              <section v-if="step === 4" class="step-panel">
                <div class="step-title"><span class="badge green">4</span> 配置执行动作 (Action)</div>
                <label>
                  选择动作类型
                  <select v-model="form.actionKind">
                    <option value="recharge">💰 资金赠送 (Recharge)</option>
                  </select>
                </label>

                <div class="action-box" v-if="form.actionKind === 'recharge'">
                  <div class="ab-title">资金发放配置</div>
                  <div class="ab-row">
                    <label>
                      充值金额 (Token)
                      <input v-model.number="form.actionAmount" type="number" min="0" />
                    </label>
                    <label>
                      过期规则
                      <div class="expire-row">
                        <select v-model="form.expireStrategy">
                          <option value="month_end">自然月失效 (Month End)</option>
                          <option value="fixed_30_days">30天后失效 (Fixed 30 Days)</option>
                          <option value="custom_date">自定义失效日期 (Custom Date)</option>
                          <option value="never">永久有效 (Permanent)</option>
                        </select>
                        <div
                          v-if="form.expireStrategy === 'custom_date'"
                          class="expire-date-box"
                        >
                          <span class="expire-date-label">选择失效日期</span>
                          <input
                            v-model="form.customExpireDate"
                            type="date"
                            class="expire-date-input"
                            placeholder="选择失效日期"
                          />
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </section>
            </main>
          </div>

          <div class="wm-foot">
            <button class="prev" @click="prevStep" :disabled="step === 1">上一步</button>
            <div class="right-actions">
              <button class="cancel" @click="showEditor = false">取消</button>
              <button v-if="step < 4" class="next" @click="nextStep">下一步</button>
              <button v-else class="save" :disabled="saving" @click="saveRule">{{ saving ? '保存中...' : '✓ 保存并发布规则' }}</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-mask" @click.self="showDeleteModal = false">
        <div class="confirm-modal">
          <div class="cm-content">
            <div class="cm-icon">⚠️</div>
            <h3>确认删除规则?</h3>
            <p>您确定要删除规则 <span class="highlight">"{{ deleteTarget?.name }}"</span> 吗？<br>此操作无法撤销，请谨慎操作。</p>
          </div>
          <div class="cm-foot">
            <button class="cancel" @click="showDeleteModal = false">取消</button>
            <button class="delete-btn" @click="confirmDelete">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showRecon" class="drawer-mask" @click.self="showRecon = false">
        <aside class="drawer">
          <div class="drawer-head">
            <div class="drawer-head-main">
              <h3>执行对账明细 · {{ reconRule?.name }}</h3>
              <p>查看执行批次、结果明细与异常情况，便于快速对账排查。</p>
            </div>
            <button class="recon-close" @click="showRecon = false">关闭</button>
          </div>
          <div class="drawer-stat">
            <div class="stat-tile">
              <div class="tile-label">累计执行批次</div>
              <strong>{{ fmt(runSummary.runCount) }}</strong>
            </div>
            <div class="stat-tile ok">
              <div class="tile-label">累计成功人数</div>
              <strong>{{ fmt(runSummary.successCount) }}</strong>
            </div>
            <div class="stat-tile danger">
              <div class="tile-label">累计失败人数</div>
              <strong>{{ fmt(runSummary.failedCount) }}</strong>
            </div>
          </div>
          <div class="drawer-body">
          <div class="db-left">
            <h4>执行批次</h4>
            <div class="run-scroll">
              <div v-if="runLoading" class="empty">加载中...</div>
              <button v-else v-for="run in runs" :key="`${run.run_time}-${run.exec_source}`" class="run-item" :class="{ active: selectedRun?.run_time === run.run_time && selectedRun?.exec_source === run.exec_source }" @click="selectRun(run)">
                <div class="run-top">
                  <span>{{ run.run_time }}</span>
                  <em class="source-chip">{{ sourceText(run.exec_source) }}</em>
                </div>
                <small>成功 {{ run.success_count }} ｜ 失败 {{ run.failed_count }} ｜ 总计 {{ run.total_count }}</small>
              </button>
            </div>
          </div>
          <div class="db-right">
            <h4>
              执行详情
              <span v-if="selectedRun" class="detail-sub">（{{ selectedRun.run_time }}）</span>
            </h4>
            <div class="table-scroll">
              <table class="detail-table">
                <thead><tr><th>触发时间</th><th>来源</th><th>被充值用户</th><th>操作人</th><th>变动额</th><th>状态</th></tr></thead>
                <tbody>
                  <tr v-if="detailLoading"><td colspan="6" class="empty">加载中...</td></tr>
                  <tr v-else-if="!details.length"><td colspan="6" class="empty">暂无明细</td></tr>
                  <tr v-else v-for="d in details" :key="`${d.user_id}-${d.trigger_time}`">
                    <td>{{ d.trigger_time }}</td>
                    <td><span class="source-chip">{{ sourceText(d.exec_source) }}</span></td>
                    <td>
                      <div class="user-cell">
                        <span class="user-name" :title="d.user_name || '-'">{{ d.user_name || '-' }}</span>
                        <span class="uuid" :title="d.user_id">{{ d.user_id }}</span>
                      </div>
                    </td>
                    <td><span class="operator-name" :title="d.operator || '-'">{{ d.operator || '-' }}</span></td>
                    <td><span :class="['amount-chip', d.change_amount >= 0 ? 'up' : 'down']">{{ d.change_amount >= 0 ? '+' : '' }}{{ d.change_amount }}</span></td>
                    <td><span :class="['status-chip', d.status === 'success' ? 'ok' : 'fail']">{{ d.status }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </aside>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.rule-page{padding:24px;background:#f8fafc;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.title-cn{font-size:24px;font-weight:700;color:#1e293b;line-height:1.2;letter-spacing:-0.5px}
.title-en{font-size:13px;color:#64748b;margin-top:4px;font-weight:500}
.create-btn{border:none;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;border-radius:10px;padding:10px 20px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(79,70,229,0.3);transition:all .2s ease;font-size:14px}
.create-btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(79,70,229,0.4)}
.create-btn:active{transform:translateY(0)}

.stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:24px}
.stat-card{background:#fff;border-radius:16px;padding:20px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.05);border:1px solid #f1f5f9;transition:transform .2s}
.stat-card:hover{transform:translateY(-2px);box-shadow:0 10px 15px -3px rgba(0,0,0,0.05)}
.stat-label{font-size:14px;color:#64748b;font-weight:500;margin-bottom:8px}
.stat-num{font-size:36px;font-weight:800;color:#0f172a;letter-spacing:-1px}
.stat-num.indigo{color:#4f46e5}.stat-num.orange{color:#f97316}

.list-card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);border:1px solid #f1f5f9}
.list-head{display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid #f1f5f9}
.list-title{font-size:18px;font-weight:700;color:#1e293b}.list-sub{font-size:13px;color:#94a3b8;margin-left:8px;font-weight:400}
.lh-left{display:flex;align-items:baseline}
.lh-right{display:flex;align-items:center;gap:12px}
.search-wrap{position:relative;display:inline-block}
.search-wrap input{border:1px solid #e2e8f0;border-radius:8px;padding:8px 32px 8px 12px;width:240px;font-size:14px;transition:all .2s;outline:none;background:#f8fafc}
.search-wrap input:focus{border-color:#6366f1;background:#fff;box-shadow:0 0 0 3px rgba(99,102,241,0.1)}
.search-clear{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;background:none;color:#94a3b8;font-size:18px;line-height:1;cursor:pointer;padding:2px;border-radius:4px;transition:all .2s}
.search-clear:hover{color:#64748b;background:#f1f5f9}
.lh-right button{border:none;background:#eff6ff;color:#4f46e5;border-radius:8px;padding:8px 16px;font-weight:600;font-size:14px;cursor:pointer;transition:all .2s}
.lh-right button:hover{background:#e0e7ff}

.rule-table{width:100%;border-collapse:collapse}
.rule-table th{background:#f8fafc;color:#475569;font-weight:600;padding:16px 24px;font-size:13px;text-align:left;border-bottom:1px solid #e2e8f0}
.rule-table td{padding:16px 24px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;vertical-align:middle}
.rule-table tr:last-child td{border-bottom:none}
.rule-table tr:hover td{background:#f8fafc}
.rname{font-weight:600;color:#0f172a;margin-bottom:2px}.rdesc{font-size:12px;color:#94a3b8}
.chip{display:inline-flex;align-items:center;background:#f1f5f9;color:#475569;border-radius:6px;padding:2px 8px;margin-right:8px;font-size:12px;font-weight:500}
.pos{color:#059669;font-weight:700;background:#ecfdf5;border:1px solid #6ee7b7;padding:2px 8px;border-radius:6px;font-size:13px;display:inline-block}
.neg{color:#dc2626;font-weight:700;background:#fef2f2;border:1px solid #fca5a5;padding:2px 8px;border-radius:6px;font-size:13px;display:inline-block}

.op{padding:6px 12px;border-radius:6px;border:none;margin-right:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s}
.op-run{background:#fff7ed;color:#ea580c}.op-run:hover{background:#ffedd5}
.op-detail{background:#eff6ff;color:#2563eb}.op-detail:hover{background:#dbeafe}
.op-link{border:none;background:none;color:#64748b;font-size:13px;cursor:pointer;font-weight:500;padding:6px 12px;transition:color .2s}
.op-link:hover{color:#0f172a;text-decoration:underline}
.op-link.danger{color:#ef4444}
.op-link.danger:hover{color:#dc2626}

.pager{display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:16px 24px;border-top:1px solid #f1f5f9}
.pager button{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:6px 12px;font-size:13px;color:#475569;cursor:pointer;transition:all .2s}
.pager button:hover:not(:disabled){border-color:#cbd5e1;background:#f8fafc;color:#1e293b}
.pager button:disabled{opacity:0.5;cursor:not-allowed}
.empty{text-align:center;color:#94a3b8;padding:40px!important}

.switch{position:relative;display:inline-block;width:40px;height:22px}
.switch input{display:none}
.slider{position:absolute;inset:0;background:#e2e8f0;border-radius:999px;cursor:pointer;transition:.3s}
.slider:before{content:'';position:absolute;width:18px;height:18px;background:#fff;border-radius:50%;left:2px;top:2px;transition:.3s;box-shadow:0 1px 2px rgba(0,0,0,0.1)}
.switch input:checked + .slider{background:#4f46e5}
.switch input:checked + .slider:before{transform:translateX(18px)}

.modal-mask{position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(4px)}
.wizard-modal{width:min(1000px,96vw);height:min(720px,90vh);background:#fff;border-radius:20px;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);overflow:hidden}
.wm-head{display:flex;justify-content:space-between;align-items:center;padding:20px 32px;border-bottom:1px solid #f1f5f9}
.wm-head h3{margin:0;font-size:20px;font-weight:700;color:#0f172a}
.close-x{border:none;background:none;font-size:24px;color:#94a3b8;cursor:pointer;padding:4px;border-radius:8px;transition:all .2s;line-height:1}
.close-x:hover{background:#f1f5f9;color:#64748b}

.wm-body{display:grid;grid-template-columns:260px 1fr;gap:0;padding:0;min-height:0;flex:1}
.stepper{background:#f8fafc;border-right:1px solid #f1f5f9;padding:32px 24px;overflow:auto}
.sitem{display:flex;gap:12px;align-items:flex-start;position:relative;padding-bottom:48px}
.sitem:last-child{padding-bottom:0}
.dot{width:24px;height:24px;border-radius:50%;border:2px solid #e2e8f0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#94a3b8;background:#fff;z-index:2;transition:all .3s}
.sitem.active .dot{border-color:#4f46e5;background:#4f46e5;color:#fff;box-shadow:0 0 0 4px rgba(79,70,229,0.1)}
.sitem.done .dot{border-color:#16a34a;background:#16a34a;color:#fff}
.st{font-size:14px;font-weight:600;color:#334155;line-height:1.4;transition:color .3s}
.sitem.active .st{color:#0f172a}.sitem.done .st{color:#0f172a}
.sd{font-size:12px;color:#94a3b8;line-height:1.4;margin-top:2px}
.sitem:not(:last-child)::after{content:'';position:absolute;left:11px;top:28px;bottom:0;width:2px;background:#e2e8f0}

.content{overflow:auto;padding:32px 40px}
.step-panel{animation:fadeIn .3s ease-out}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.step-title{font-size:24px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:12px;margin-bottom:24px}
.badge{width:32px;height:32px;border-radius:10px;background:#eff6ff;color:#4f46e5;display:inline-flex;align-items:center;justify-content:center;font-size:16px;font-weight:700}
.badge.purple{background:#f5f3ff;color:#7c3aed}.badge.yellow{background:#fefce8;color:#ca8a04}.badge.green{background:#f0fdf4;color:#16a34a}

.form-grid.one{display:grid;grid-template-columns:1fr 1fr;gap:20px}
label{display:flex;flex-direction:column;gap:8px;font-size:14px;font-weight:500;color:#334155}
input,select{border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;font-size:14px;background:#fff;transition:all .2s;outline:none;color:#0f172a}
select{appearance:none;-webkit-appearance:none;-moz-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:16px;padding-right:40px;cursor:pointer}
input:focus,select:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.1)}
.inline-check{display:flex;align-items:center;gap:10px;flex-direction:row;margin-top:30px;cursor:pointer}
.inline-check input{width:18px;height:18px;accent-color:#4f46e5}

.trigger-mode{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.mode-card{border:2px solid #f1f5f9;background:#fff;border-radius:16px;padding:20px;cursor:pointer;text-align:left;transition:all .2s}
.mode-card:hover{border-color:#cbd5e1;transform:translateY(-2px)}
.mode-card.active{border-color:#6366f1;background:#eef2ff;box-shadow:0 4px 12px rgba(99,102,241,0.1)}
.mt{font-size:16px;font-weight:700;color:#1e293b}.ms{font-size:13px;color:#64748b;margin-top:6px;line-height:1.4}

.cron-box,.event-box{margin-top:24px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;padding:24px}
.lb{font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}.mt12{margin-top:20px}
.seg{display:inline-flex;background:#e2e8f0;border-radius:10px;padding:4px;margin-top:8px}
.seg button{border:none;background:transparent;padding:6px 16px;border-radius:8px;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;transition:all .2s}
.seg button.on{background:#fff;color:#0f172a;box-shadow:0 1px 2px rgba(0,0,0,0.1)}
.cron-line{display:flex;gap:12px;align-items:center;margin-top:12px}
.small-input{display:flex;gap:8px;align-items:center;font-size:14px;color:#334155}
.small-input input,.small-input select{width:100px}
.time-input{width:140px}
.preview{margin-top:16px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;font-family:"Menlo",monospace;font-size:13px;color:#6366f1;display:flex;align-items:center;gap:8px}
.preview:before{content:'Cron Expression:';color:#94a3b8;font-size:12px;font-weight:600}
.hint{margin-top:16px;background:#eff6ff;border:1px solid #dbeafe;border-radius:10px;padding:12px 16px;color:#1e40af;font-size:13px;line-height:1.5}

.filter-container{background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:24px}
.fc-head{font-size:15px;color:#0f172a;margin-bottom:16px;font-weight:600}
.active-filters{display:flex;flex-direction:column;gap:12px;min-height:60px}
.no-filters{padding:20px;text-align:center;color:#94a3b8;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;font-size:14px}
.filter-card{border:1px solid #e2e8f0;border-radius:12px;background:#fff;overflow:hidden;transition:all .2s;display:flex;flex-direction:column}
.filter-card:hover{border-color:#cbd5e1;box-shadow:0 4px 12px rgba(0,0,0,0.03)}
.fc-title{padding:12px 16px;background:#f8fafc;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center}
.fc-left{display:flex;align-items:center;gap:8px;font-weight:600;color:#334155;font-size:14px}
.fc-icon{font-size:16px}
.fc-del{border:none;background:none;cursor:pointer;font-size:14px;opacity:0.5;transition:opacity .2s}
.fc-del:hover{opacity:1;color:#dc2626}
.fc-content{padding:16px;display:flex;align-items:center;gap:12px}
.fc-inputs{display:flex;align-items:center;gap:10px;font-size:14px;color:#475569;flex-wrap:wrap}
.fc-error{margin-left:8px;color:#e02424;font-size:12px}
.sep{color:#cbd5e1;margin:0 4px;font-weight:300}
.text-gray{color:#94a3b8;font-style:italic}

.add-filter-area{margin-top:32px;border-top:1px solid #f1f5f9;padding-top:24px}
.af-label{font-size:14px;color:#64748b;margin-bottom:12px;font-weight:500}
.af-list{display:flex;flex-wrap:wrap;gap:10px}
.af-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:20px;font-size:13px;color:#475569;cursor:pointer;transition:all .2s}
.af-btn:hover:not(:disabled){border-color:#6366f1;color:#4f46e5;background:#eff6ff}
.af-btn:disabled{opacity:0.5;cursor:not-allowed;background:#f1f5f9}
.af-icon{font-size:14px}
.plus{margin-left:4px;font-weight:700;color:#cbd5e1}
.af-btn:hover .plus{color:#6366f1}

.input-sm{width:80px;text-align:center}
.input-md{width:100px;text-align:center}

/* 受众预览区域：展示全部命中用户，表格美观、长文本省略 */
.audience-preview-area{margin-top:28px;padding:24px;background:linear-gradient(180deg,#f0fdf4 0%,#ecfdf5 100%);border:1px solid #86efac;border-radius:16px;box-shadow:0 2px 8px rgba(22,163,74,0.06)}
.ap-title{font-size:16px;font-weight:700;color:#14532d;margin:0 0 14px;letter-spacing:0.3px}
.ap-msg{margin:0 0 14px;font-size:14px;color:#15803d;line-height:1.5}
.ap-msg.ap-error{color:#b91c1c}
.ap-msg.ap-hint{color:#64748b}
.ap-msg.ap-total{font-size:15px;color:#0f172a;margin-bottom:16px}
.ap-table-wrap{max-height:340px;overflow:auto;border:1px solid #86efac;border-radius:12px;background:#fff;box-shadow:inset 0 1px 2px rgba(0,0,0,0.04)}
.ap-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
.ap-table th{background:linear-gradient(180deg,#dcfce7 0%,#d1fae5 100%);color:#14532d;padding:12px 16px;text-align:left;position:sticky;top:0;z-index:1;font-weight:600;white-space:nowrap;border-bottom:2px solid #86efac}
.ap-table td{padding:10px 16px;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:middle}
.ap-table tbody tr:hover td{background:#f8fdf9}
.ap-table tbody tr:last-child td{border-bottom:none}
.ap-col-num{width:56px;text-align:center;color:#64748b;font-weight:500}
.ap-col-id{width:32%;min-width:140px}
.ap-col-name{width:auto;min-width:120px}
.ap-cell-truncate{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.ap-col-name .ap-cell-truncate{font-family:inherit;font-size:13px}


.action-box{margin-top:20px;border:1px solid #fed7aa;background:#fff7ed;border-radius:16px;padding:24px}
.ab-title{font-size:15px;font-weight:700;color:#c2410c;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.ab-title:before{content:'🎁';font-size:18px}
.ab-row{display:grid;grid-template-columns:1fr 1fr;gap:20px}

/* 过期规则区域优化，让自定义日期更宽松、不拥挤 */
.expire-row{
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  gap:10px;
  margin-top:6px;
}
.expire-row select{
  width:100%;
  max-width:260px;
}
.expire-date-box{
  display:flex;
  align-items:center;
  gap:10px;
  padding:10px 12px;
  border-radius:12px;
  background:rgba(254, 243, 199, 0.7);
  border:1px dashed #facc15;
}
.expire-date-label{
  font-size:13px;
  color:#92400e;
  white-space:nowrap;
}
.expire-date-input{
  min-width:230px;
  max-width:300px;
  width:100%;
  height:44px;
  padding:10px 14px;
  font-size:14px;
  border-radius:10px;
  background:#fff;
}

.wm-foot{display:flex;justify-content:space-between;align-items:center;padding:20px 32px;border-top:1px solid #f1f5f9;background:#fff}
.prev,.cancel,.next,.save{border:none;border-radius:10px;padding:10px 20px;cursor:pointer;font-size:14px;font-weight:600;transition:all .2s}
.prev{background:#0f172a;border:1px solid #0f172a;color:#fff}.prev:hover:not(:disabled){border-color:#1e293b;background:#1e293b;color:#fff}
.right-actions{display:flex;gap:12px}
.cancel{background:#fff;color:#64748b}.cancel:hover{background:#f8fafc;color:#334155}
.next{background:#0f172a;color:#fff;box-shadow:0 4px 12px rgba(15,23,42,0.2)}.next:hover{background:#1e293b;transform:translateY(-1px)}
.save{background:#16a34a;color:#fff;box-shadow:0 4px 12px rgba(22,163,74,0.2)}.save:hover{background:#15803d;transform:translateY(-1px)}
.prev:disabled,.next:disabled,.save:disabled{opacity:0.5;cursor:not-allowed;transform:none}

.confirm-modal{width:400px;background:#fff;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);overflow:hidden;animation:popIn .2s ease-out}
@keyframes popIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
.cm-content{padding:32px 24px;text-align:center}
.cm-icon{font-size:48px;margin-bottom:16px}
.cm-content h3{margin:0 0 12px;font-size:20px;color:#1e293b;font-weight:700}
.cm-content p{margin:0;font-size:14px;color:#64748b;line-height:1.6}
.highlight{color:#0f172a;font-weight:600}
.cm-foot{display:flex;border-top:1px solid #f1f5f9}
.cm-foot button{flex:1;padding:16px;border:none;background:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s}
.cm-foot .cancel{color:#64748b;border-right:1px solid #f1f5f9}
.cm-foot .cancel:hover{background:#f8fafc;color:#334155}
.cm-foot .delete-btn{color:#ef4444}
.cm-foot .delete-btn:hover{background:#fef2f2;color:#dc2626}

.drawer-mask{position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:99998;backdrop-filter:blur(6px);transition:opacity .3s}
.drawer{margin-left:auto;width:min(1320px,97vw);height:100%;background:#f1f5f9;display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(2,6,23,0.25)}
.drawer-head{padding:24px 32px;background:#fff;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e2e8f0;flex-shrink:0}
.drawer-head-main h3{font-size:22px;font-weight:800;color:#0f172a;margin:0;line-height:1.3}
.drawer-head-main p{margin-top:6px;font-size:13px;color:#64748b}
.recon-close{border:none;background:#f1f5f9;color:#475569;padding:8px 14px;border-radius:10px;font-weight:600;cursor:pointer;transition:.2s}
.recon-close:hover{background:#e2e8f0;color:#0f172a}

.drawer-stat{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:20px 32px;background:#fff;border-bottom:1px solid #e2e8f0;flex-shrink:0}
.stat-tile{background:linear-gradient(180deg,#f8fafc,#f1f5f9);border-radius:12px;padding:16px 20px;border:1px solid #e2e8f0;display:flex;flex-direction:column;gap:8px}
.stat-tile .tile-label{font-size:13px;color:#64748b;font-weight:600}
.stat-tile strong{font-size:30px;color:#0f172a;font-weight:800;line-height:1}
.stat-tile.ok strong{color:#059669}
.stat-tile.danger strong{color:#dc2626}

.drawer-body{flex:1;min-height:0;display:grid;grid-template-columns:300px 1fr;gap:22px;padding:20px 24px;overflow:hidden}
.db-left{background:#fff;border-radius:14px;border:1px solid #dbe2ea;display:flex;flex-direction:column;overflow:hidden}
.db-left h4{padding:14px 16px;margin:0;font-size:15px;font-weight:700;color:#334155;border-bottom:1px solid #f1f5f9;background:#fff;flex-shrink:0}
.db-left .empty{padding:20px;color:#94a3b8;text-align:center;font-size:13px}
.run-scroll{padding:12px;overflow-y:auto;flex:1}
.run-item{width:100%;text-align:left;border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:14px 12px;margin-bottom:10px;cursor:pointer;transition:all .2s}
.run-item:hover{border-color:#cbd5e1;background:#f8fafc}
.run-item.active{background:#eef2ff;border-color:#6366f1;box-shadow:0 4px 12px rgba(99,102,241,0.12)}
.run-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.run-top span{font-weight:700;font-size:13px;color:#0f172a}
.run-item small{color:#64748b;font-size:12px;display:block;line-height:1.4}

.db-right{background:#fff;border-radius:14px;border:1px solid #dbe2ea;display:flex;flex-direction:column;overflow:hidden}
.db-right h4{padding:14px 18px;margin:0;font-size:15px;font-weight:700;color:#334155;border-bottom:1px solid #f1f5f9;background:#fff;flex-shrink:0;display:flex;align-items:center;gap:6px}
.detail-sub{font-size:12px;color:#64748b;font-weight:500}
.table-scroll{overflow:auto;flex:1;padding-right:4px}
.detail-table{width:100%;border-collapse:separate;border-spacing:0}
.detail-table th{background:#f8fafc;color:#475569;font-weight:700;padding:14px 16px;font-size:13px;text-align:left;border-bottom:1px solid #e2e8f0;position:sticky;top:0;z-index:5;white-space:nowrap}
.detail-table td{padding:14px 16px;border-bottom:1px solid #f1f5f9;font-size:14px;line-height:1.55;color:#334155;vertical-align:middle}
.detail-table tr:nth-child(even) td{background:#fcfdff}
.detail-table tr:hover td{background:#f8fafc}
.source-chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:12px;font-style:normal;font-weight:600;white-space:nowrap}
.user-cell{display:flex;flex-direction:column;gap:2px;max-width:180px}
.user-name{font-size:13px;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uuid{display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:11px;word-break:break-all;color:#64748b;line-height:1.3}
.operator-name{display:inline-flex;align-items:center;padding:2px 8px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;color:#334155;font-size:12px;font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.amount-chip{display:inline-flex;align-items:center;padding:4px 10px;border-radius:8px;font-weight:700;font-size:13px}
.amount-chip.up{color:#047857;background:#ecfdf5;border:1px solid #6ee7b7}
.amount-chip.down{color:#b91c1c;background:#fef2f2;border:1px solid #fca5a5}
.status-chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;text-transform:lowercase}
.status-chip.ok{background:#dcfce7;color:#166534}
.status-chip.fail{background:#fee2e2;color:#991b1b}

@media (max-width: 1200px){
  .title-cn{font-size:20px}
  .wm-body{grid-template-columns:200px 1fr}
  .content{padding:24px}
  .drawer{width:min(1140px,98vw)}
  .drawer-body{grid-template-columns:280px 1fr}
}

@media (max-width: 920px){
  .drawer{width:100vw}
  .drawer-head{padding:18px 16px}
  .drawer-head-main h3{font-size:18px}
  .drawer-stat{padding:14px 16px;grid-template-columns:1fr}
  .drawer-body{grid-template-columns:1fr;padding:14px}
  .db-left,.db-right{min-height:240px}
  .detail-table th,.detail-table td{padding:10px}
}
</style>
