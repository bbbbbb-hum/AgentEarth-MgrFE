<script setup lang="ts">
import { ref } from 'vue';

interface ServiceConfig {
  Name: string;
  Type: string;
  Description: string;
  ProjectName: string;
  MaxInstance: number;
  LaunchInfo: string;
  ConnectInfo: string;
  InstallInfo: string;
  AccountRequired: number;
}

const emit = defineEmits<{
  save: [formData: any];
  close: [];
}>();

const formData = ref<ServiceConfig>({
  Name: '',
  Type: 'stdio',
  Description: '',
  ProjectName: '',
  MaxInstance: 1,
  LaunchInfo: JSON.stringify({
    command: 'node',
    args: ['server.js'],
    workdir: '/opt/mcp/service',
    env: {},
    max_instance: 1,
    max_restarts: 3,
    launch_timeout: 100000,
    shutdown_timeout: 100000,
    idle_ttl: 100000000
  }, null, 2),
  ConnectInfo: JSON.stringify({
    url: 'http://localhost:8080/mcp/sse',
    headers: {},
    connect_timeout: 3000,
    max_connect: 10,
    max_retry: 3,
    interval: 1000
  }, null, 2),
  InstallInfo: '',
  AccountRequired: 0
});

const error = ref('');

const serviceTypes = [
  { label: '标准输入输出', value: 'stdio' },
  { label: 'SSE连接', value: 'sse' }
];

const validateForm = () => {
  if (!formData.value.Name.trim()) {
    error.value = '请输入服务名称';
    return false;
  }
  if (!formData.value.Type) {
    error.value = '请选择服务类型';
    return false;
  }
  if (!formData.value.Description.trim()) {
    error.value = '请输入服务描述';
    return false;
  }
  if (!formData.value.ProjectName.trim()) {
    error.value = '请输入项目名称';
    return false;
  }
  
  try {
    if (formData.value.LaunchInfo) {
      JSON.parse(formData.value.LaunchInfo);
    }
    if (formData.value.ConnectInfo) {
      JSON.parse(formData.value.ConnectInfo);
    }
  } catch (e) {
    error.value = '启动信息或连接信息格式不正确，必须是有效的JSON格式';
    return false;
  }
  
  error.value = '';
  return true;
};

const handleSubmit = () => {
  if (!validateForm()) {
    return;
  }
  
  emit('save', {
    name: formData.value.Name,
    type: formData.value.Type,
    description: formData.value.Description,
    project_name: formData.value.ProjectName,
    max_instance: formData.value.MaxInstance,
    launch_info: formData.value.LaunchInfo,
    connect_info: formData.value.ConnectInfo,
    install_info: formData.value.InstallInfo,
    account_required: formData.value.AccountRequired
  });
};

const handleClose = () => {
  emit('close');
};
</script>

<template>
  <div class="modal-overlay" @click="handleClose">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>新增服务配置</h2>
        <button class="close-btn" @click="handleClose">×</button>
      </div>

      <div v-if="error" class="alert alert-error">
        {{ error }}
      </div>

      <div class="modal-body">
        <form @submit.prevent="handleSubmit" class="service-form">
          <div class="form-row">
            <div class="form-group">
              <label for="serviceName">服务名称 <span class="required">*</span></label>
              <input
                id="serviceName"
                v-model="formData.Name"
                type="text"
                placeholder="请输入服务名称"
                required
              />
            </div>

            <div class="form-group">
              <label for="serviceType">服务类型 <span class="required">*</span></label>
              <select id="serviceType" v-model="formData.Type" required>
                <option v-for="type in serviceTypes" :key="type.value" :value="type.value">
                  {{ type.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="projectName">项目名称 <span class="required">*</span></label>
              <input
                id="projectName"
                v-model="formData.ProjectName"
                type="text"
                placeholder="请输入项目名称"
                required
              />
            </div>

            <div class="form-group">
              <label for="maxInstance">最大实例数</label>
              <input
                id="maxInstance"
                v-model.number="formData.MaxInstance"
                type="number"
                min="1"
                placeholder="请输入最大实例数"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="description">服务描述 <span class="required">*</span></label>
            <textarea
              id="description"
              v-model="formData.Description"
              rows="3"
              placeholder="请输入服务描述"
              required
            ></textarea>
          </div>

          <div class="form-group">
            <label for="launchInfo">启动信息 (JSON格式)</label>
            <textarea
              id="launchInfo"
              v-model="formData.LaunchInfo"
              rows="8"
              placeholder='请输入启动信息，JSON格式，例如：{"command": "node", "args": ["server.js"]}'
            ></textarea>
            <small class="form-hint">用于 stdio 类型服务，包含启动命令、参数、工作目录等配置</small>
          </div>

          <div class="form-group">
            <label for="connectInfo">连接信息 (JSON格式)</label>
            <textarea
              id="connectInfo"
              v-model="formData.ConnectInfo"
              rows="8"
              placeholder='请输入连接信息，JSON格式，例如：{"url": "http://localhost:8080/mcp/sse"}'
            ></textarea>
            <small class="form-hint">用于 sse 类型服务，包含连接URL、请求头、超时等配置</small>
          </div>

          <div class="form-group">
            <label for="installInfo">安装信息</label>
            <textarea
              id="installInfo"
              v-model="formData.InstallInfo"
              rows="3"
              placeholder="请输入安装信息（可选）"
            ></textarea>
            <small class="form-hint">服务克隆仓库安装命令等信息</small>
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input
                v-model="formData.AccountRequired"
                type="checkbox"
                :true-value="1"
                :false-value="0"
              />
              <span>此服务需要账号信息</span>
            </label>
          </div>
        </form>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleClose">
          取消
        </button>
        <button class="btn btn-primary" @click="handleSubmit">
          保存
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  max-width: 800px;
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

.modal-header h2 {
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
  margin: 0 20px;
  font-size: 0.9rem;
}

.alert-error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.service-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
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

.form-group textarea {
  resize: vertical;
  min-height: 100px;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
}

.form-hint {
  color: #7f8c8d;
  font-size: 0.85rem;
}

.checkbox-group {
  flex-direction: row;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 15px;
  padding: 20px;
  border-top: 1px solid #e0e6ed;
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

.btn-primary {
  background-color: #3498db;
  color: #fff;
}

.btn-primary:hover {
  background-color: #2980b9;
}

.btn-secondary {
  background-color: #95a5a6;
  color: #fff;
}

.btn-secondary:hover {
  background-color: #7f8c8d;
}

@media (max-width: 768px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
