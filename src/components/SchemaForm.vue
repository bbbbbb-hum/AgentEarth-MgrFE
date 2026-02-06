<template>
  <div class="schema-form">
    <div v-if="!schema || !schema.properties" class="no-params">
      此工具无需参数
    </div>
    <div v-else class="form-fields">
      <div 
        v-for="(propSchema, propName) in schema.properties" 
        :key="propName"
        class="form-field"
      >
        <label class="field-label">
          {{ propName }}
          <span v-if="isRequired(propName)" class="required">*</span>
        </label>
        <div class="field-description" v-if="propSchema.description">
          {{ propSchema.description }}
        </div>
        
        <!-- String 类型 -->
        <input
          v-if="propSchema.type === 'string' && !propSchema.enum"
          type="text"
          class="field-input"
          :placeholder="getPlaceholder(propSchema)"
          v-model="formData[propName]"
        />
        
        <!-- Enum 类型 (下拉选择) -->
        <select
          v-else-if="propSchema.enum"
          class="field-input"
          v-model="formData[propName]"
        >
          <option value="">请选择...</option>
          <option v-for="opt in propSchema.enum" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>
        
        <!-- Number / Integer 类型 -->
        <input
          v-else-if="propSchema.type === 'number' || propSchema.type === 'integer'"
          type="number"
          class="field-input"
          :placeholder="getPlaceholder(propSchema)"
          :min="propSchema.minimum"
          :max="propSchema.maximum"
          :step="propSchema.type === 'integer' ? 1 : 'any'"
          v-model.number="formData[propName]"
        />
        
        <!-- Boolean 类型 -->
        <label v-else-if="propSchema.type === 'boolean'" class="switch-label">
          <input
            type="checkbox"
            class="switch-input"
            v-model="formData[propName]"
          />
          <span class="switch-slider"></span>
          <span class="switch-text">{{ formData[propName] ? '是' : '否' }}</span>
        </label>
        
        <!-- Array 类型 -->
        <div v-else-if="propSchema.type === 'array'" class="array-field">
          <div 
            v-for="(item, index) in (formData[propName] || [])" 
            :key="index"
            class="array-item"
          >
            <input
              type="text"
              class="field-input array-input"
              v-model="formData[propName][index]"
              :placeholder="`第 ${index + 1} 项`"
            />
            <button 
              type="button" 
              class="btn-icon btn-remove"
              @click="removeArrayItem(propName, index)"
            >
              ×
            </button>
          </div>
          <button 
            type="button" 
            class="btn btn-sm btn-add"
            @click="addArrayItem(propName)"
          >
            + 添加项
          </button>
        </div>
        
        <!-- Object 类型 (JSON编辑器) -->
        <textarea
          v-else-if="propSchema.type === 'object'"
          class="field-input field-textarea"
          :placeholder="getPlaceholder(propSchema)"
          v-model="formData[propName]"
          rows="4"
        ></textarea>
        
        <!-- 其他类型 (默认文本输入) -->
        <input
          v-else
          type="text"
          class="field-input"
          :placeholder="getPlaceholder(propSchema)"
          v-model="formData[propName]"
        />
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
  return `请输入${propSchema.type || '值'}`;
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
  font-size: 0.9rem;
  text-align: center;
  padding: 32px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #e2e8f0;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
}

.field-description {
  font-size: 0.8rem;
  color: #64748b;
  margin-bottom: 4px;
  line-height: 1.4;
}

.field-input {
  padding: 10px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: all 0.2s ease;
  background: #fff;
  color: #1e293b;
}

.field-input:hover {
  border-color: #94a3b8;
}

.field-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.field-textarea {
  resize: vertical;
  min-height: 100px;
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
}

/* Switch 样式 */
.switch-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 4px 0;
}

.switch-input {
  display: none;
}

.switch-slider {
  width: 48px;
  height: 26px;
  background: #cbd5e1;
  border-radius: 13px;
  position: relative;
  transition: background 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.switch-slider::after {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.switch-input:checked + .switch-slider {
  background: #3b82f6;
}

.switch-input:checked + .switch-slider::after {
  transform: translateX(22px);
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
  gap: 10px;
}

.array-item {
  display: flex;
  gap: 10px;
  align-items: center;
}

.array-input {
  flex: 1;
}

.btn-icon {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  transition: all 0.2s;
}

.btn-remove {
  background: #fee2e2;
  color: #ef4444;
}

.btn-remove:hover {
  background: #fecaca;
  color: #dc2626;
}

.btn-add {
  background: #eff6ff;
  color: #2563eb;
  border: 1px dashed #bfdbfe;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
  align-self: flex-start;
  transition: all 0.2s;
  font-weight: 500;
}

.btn-add:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}
</style>
