<script setup lang="ts">
import { ref } from 'vue';

interface ServiceConfig {
  Name: string;
  WemcpName: string;
  Tags: string;
  Description: string;
  Comments: string;
  CodeSourceUrl: string;
  AccountRequired: number;
}

const emit = defineEmits<{
  save: [formData: any];
  close: [];
}>();

const formData = ref<ServiceConfig>({
  Name: '',
  WemcpName: '',
  Tags: '',
  Description: '',
  Comments: '',
  CodeSourceUrl: '',
  AccountRequired: 0,
});

const error = ref('');

const validateForm = () => {
  if (!formData.value.Name.trim()) {
    error.value = '请输入服务名称';
    return false;
  }
  if (!formData.value.WemcpName.trim()) {
    error.value = '请输入 WemcpName';
    return false;
  }
  if (!/^wemcp2-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formData.value.WemcpName.trim())) {
    error.value = 'WemcpName 格式不正确，应类似 wemcp2-qweather';
    return false;
  }
  if (!formData.value.Description.trim()) {
    error.value = '请输入服务描述';
    return false;
  }
  error.value = '';
  return true;
};

const handleSubmit = () => {
  if (!validateForm()) {
    return;
  }
  
  const tags = formData.value.Tags
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  emit('save', {
    name: formData.value.Name,
    wemcp_name: formData.value.WemcpName,
    tags,
    description: formData.value.Description,
    comments: formData.value.Comments,
    code_source_url: formData.value.CodeSourceUrl,
    account_required: formData.value.AccountRequired,
    test_status: 0,
    online_status: 0
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
              <label for="wemcpName">WemcpName <span class="required">*</span></label>
              <input
                id="wemcpName"
                v-model="formData.WemcpName"
                type="text"
                placeholder="例如：wemcp2-qweather"
                required
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="tags">Tags</label>
              <input
                id="tags"
                v-model="formData.Tags"
                type="text"
                placeholder="逗号分隔，例如：a,b,c"
              />
            </div>

            <div class="form-group">
              <label for="codeSourceUrl">源地址</label>
              <input
                id="codeSourceUrl"
                v-model="formData.CodeSourceUrl"
                type="text"
                placeholder="可选"
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
            <label for="comments">备注</label>
            <textarea
              id="comments"
              v-model="formData.Comments"
              rows="3"
              placeholder="可选"
            ></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="accountRequired">需要账号</label>
              <select id="accountRequired" v-model.number="formData.AccountRequired">
                <option :value="0">否</option>
                <option :value="1">是</option>
              </select>
            </div>
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
