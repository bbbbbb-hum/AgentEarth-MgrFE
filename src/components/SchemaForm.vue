<template>
  <div class="schema-form">
    <div v-if="!schema || !schema.properties" class="no-params">
      <span class="no-params-icon">✨</span>
      此工具无需任何参数配置，可直接运行。
    </div>
    <div v-else class="form-fields">
      <div 
        v-for="(propSchema, propName) in schema.properties" 
        :key="propName"
        class="form-field"
      >
        <div class="field-header">
          <label class="field-label">
            {{ propName }}
            <span v-if="isRequired(propName)" class="required" title="必填">*</span>
          </label>
          <div class="field-type-badge">{{ propSchema.type }}</div>
        </div>
        
        <div class="field-description" v-if="propSchema.description">
          {{ propSchema.description }}
        </div>
        
        <!-- String 类型 -->
        <div class="input-wrapper" v-if="propSchema.type === 'string' && !propSchema.enum">
          <input
            type="text"
            class="field-input"
            :placeholder="getPlaceholder(propSchema)"
            v-model="formData[propName]"
          />
        </div>
        
        <!-- Enum 类型 (下拉选择) -->
        <div class="select-wrapper" v-else-if="propSchema.enum">
          <select
            class="field-input field-select"
            v-model="formData[propName]"
          >
            <option value="">请选择...</option>
            <option v-for="opt in propSchema.enum" :key="opt" :value="opt">
              {{ opt }}
            </option>
          </select>
          <span class="select-arrow">▼</span>
        </div>
        
        <!-- Number / Integer 类型 -->
        <div class="input-wrapper" v-else-if="propSchema.type === 'number' || propSchema.type === 'integer'">
          <input
            type="number"
            class="field-input"
            :placeholder="getPlaceholder(propSchema)"
            :min="propSchema.minimum"
            :max="propSchema.maximum"
            :step="propSchema.type === 'integer' ? 1 : 'any'"
            v-model.number="formData[propName]"
          />
        </div>
        
        <!-- Boolean 类型 -->
        <label v-else-if="propSchema.type === 'boolean'" class="switch-label">
          <input
            type="checkbox"
            class="switch-input"
            v-model="formData[propName]"
          />
          <div class="switch-track">
            <span class="switch-thumb"></span>
          </div>
          <span class="switch-text">{{ formData[propName] ? '开启 (True)' : '关闭 (False)' }}</span>
        </label>
        
        <!-- Array 类型 -->
        <div v-else-if="propSchema.type === 'array'" class="array-field">
          <div class="array-list">
            <div 
              v-for="(item, index) in (formData[propName] || [])" 
              :key="index"
              class="array-item"
            >
              <span class="array-index">{{ Number(index) + 1 }}</span>
              <input
                type="text"
                class="field-input array-input"
                v-model="formData[propName][index]"
                :placeholder="`输入第 ${Number(index) + 1} 项的值`"
              />
              <button 
                type="button" 
                class="btn-icon btn-remove"
                @click="removeArrayItem(propName, Number(index))"
                title="移除此项"
              >
                ×
              </button>
            </div>
          </div>
          <button 
            type="button" 
            class="btn-dashed btn-add"
            @click="addArrayItem(propName)"
          >
            <span class="plus-icon">+</span> 添加项
          </button>
        </div>
        
        <!-- Object 类型 (JSON编辑器) -->
        <div class="input-wrapper" v-else-if="propSchema.type === 'object'">
          <textarea
            class="field-input field-textarea"
            :placeholder="getPlaceholder(propSchema)"
            v-model="formData[propName]"
            rows="5"
          ></textarea>
        </div>
        
        <!-- 其他类型 (默认文本输入) -->
        <div class="input-wrapper" v-else>
          <input
            type="text"
            class="field-input"
            :placeholder="getPlaceholder(propSchema)"
            v-model="formData[propName]"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import type { JSONSchema } from '../types/mcp';

const props = defineProps<{
  schema?: JSONSchema;
  modelValue?: Record<string, any>;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, any>): void;
}>();

const formData = ref<Record<string, any>>({});

// 初始化表单数据
const initFormData = () => {
  const data: Record<string, any> = {};
  if (props.schema?.properties) {
    for (const [key, propSchema] of Object.entries(props.schema.properties)) {
      // 使用默认值或初始化空值
      if (propSchema.default !== undefined) {
        data[key] = propSchema.default;
      } else if (propSchema.type === 'array') {
        data[key] = [];
      } else if (propSchema.type === 'boolean') {
        data[key] = false;
      } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
        data[key] = null;
      } else {
        data[key] = '';
      }
    }
  }
  // 合并外部传入的值
  if (props.modelValue) {
    Object.assign(data, props.modelValue);
  }
  formData.value = data;
};

// 检查字段是否必填
const isRequired = (propName: string): boolean => {
  return props.schema?.required?.includes(propName) || false;
};

// 获取占位符
const getPlaceholder = (propSchema: JSONSchema): string => {
  if (propSchema.description) return propSchema.description;
  if (propSchema.type === 'object') return '请输入JSON格式数据';
  return `请输入 ${propSchema.type || '值'}`;
};

// 数组操作
const addArrayItem = (propName: string) => {
  if (!formData.value[propName]) {
    formData.value[propName] = [];
  }
  formData.value[propName].push('');
};

const removeArrayItem = (propName: string, index: number) => {
  formData.value[propName].splice(index, 1);
};

// 监听表单数据变化，emit给父组件
watch(formData, (newVal) => {
  // 清理空值
  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(newVal)) {
    if (value !== '' && value !== null && value !== undefined) {
      // 对于数组，过滤空字符串
      if (Array.isArray(value)) {
        const filtered = value.filter(v => v !== '');
        if (filtered.length > 0) {
          cleanData[key] = filtered;
        }
      } else {
        cleanData[key] = value;
      }
    }
  }
  emit('update:modelValue', cleanData);
}, { deep: true });

// 监听schema变化，重新初始化
watch(() => props.schema, () => {
  initFormData();
}, { immediate: true });

onMounted(() => {
  initFormData();
});
</script>

<style scoped>
.schema-form {
  padding: 0;
}

.no-params {
  color: #64748b;
  font-size: 0.95rem;
  text-align: center;
  padding: 40px;
  background: #f8fafc;
  border-radius: 16px;
  border: 1px dashed #e2e8f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.no-params-icon {
  font-size: 2rem;
  margin-bottom: 4px;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.field-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #334155;
  display: flex;
  align-items: center;
}

.required {
  color: #ef4444;
  margin-left: 4px;
  font-size: 1.2rem;
  line-height: 1;
}

.field-type-badge {
  font-size: 0.7rem;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.field-description {
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.5;
  margin-bottom: 4px;
}

/* 输入框通用样式 */
.field-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 0.95rem;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  background: #fff;
  color: #1e293b;
  box-sizing: border-box;
}

.field-input:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.field-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  background: #fff;
}

.field-textarea {
  resize: vertical;
  min-height: 120px;
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
  line-height: 1.6;
}

/* Select 样式 */
.select-wrapper {
  position: relative;
}

.field-select {
  appearance: none;
  padding-right: 40px;
  cursor: pointer;
}

.select-arrow {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  font-size: 0.8rem;
  pointer-events: none;
}

/* Switch 样式 */
.switch-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 8px 0;
  user-select: none;
}

.switch-input {
  display: none;
}

.switch-track {
  width: 44px;
  height: 24px;
  background: #cbd5e1;
  border-radius: 12px;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.switch-thumb {
  position: absolute;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.switch-input:checked + .switch-track {
  background: #3b82f6;
}

.switch-input:checked + .switch-track .switch-thumb {
  transform: translateX(20px);
}

.switch-text {
  font-size: 0.9rem;
  color: #475569;
  font-weight: 500;
}

/* Array 样式 */
.array-field {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.array-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.array-item {
  display: flex;
  gap: 10px;
  align-items: center;
  background: #f8fafc;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
}

.array-index {
  font-size: 0.8rem;
  color: #94a3b8;
  font-weight: 600;
  width: 20px;
  text-align: center;
}

.array-input {
  flex: 1;
  border: 1px solid transparent;
  background: transparent;
  padding: 8px;
}

.array-input:focus {
  background: #fff;
  border-color: #3b82f6;
}

.btn-icon {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  transition: all 0.2s;
  background: transparent;
  color: #cbd5e1;
}

.btn-remove:hover {
  background: #fee2e2;
  color: #ef4444;
}

.btn-dashed {
  background: #fff;
  color: #3b82f6;
  border: 1px dashed #bfdbfe;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  font-weight: 500;
}

.btn-dashed:hover {
  background: #eff6ff;
  border-color: #3b82f6;
  transform: translateY(-1px);
}

.plus-icon {
  font-size: 1.1rem;
  font-weight: bold;
}
</style>