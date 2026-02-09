<template>
  <div class="content-renderer">
    <!-- 数组类型内容（MCP标准格式） -->
    <template v-if="Array.isArray(content)">
      <div 
        v-for="(item, index) in content" 
        :key="index" 
        class="content-item"
        :class="getItemClass(item)"
      >
        <!-- 文本类型 -->
        <template v-if="item.type === 'text'">
          <div class="text-content">
            <div class="content-type-badge text-badge">
              <span class="badge-icon">📝</span>
              <span>文本</span>
            </div>
            <pre class="text-body">{{ tryFormatJson(item.text) }}</pre>
          </div>
        </template>
        
        <!-- 图片类型 -->
        <template v-else-if="item.type === 'image'">
          <div class="image-content">
            <div class="content-type-badge image-badge">
              <span class="badge-icon">🖼️</span>
              <span>图片</span>
              <span v-if="item.mimeType" class="mime-type">{{ item.mimeType }}</span>
            </div>
            <div class="image-preview">
              <img 
                v-if="item.data" 
                :src="getImageSrc(item)" 
                :alt="item.alt || '图片'"
                @error="handleImageError"
              />
              <div v-else class="image-placeholder">
                <span>🖼️</span>
                <span>无法加载图片</span>
              </div>
            </div>
          </div>
        </template>
        
        <!-- 资源类型 -->
        <template v-else-if="item.type === 'resource'">
          <div class="resource-content">
            <div class="content-type-badge resource-badge">
              <span class="badge-icon">📁</span>
              <span>资源</span>
            </div>
            <div class="resource-info">
              <div class="resource-uri" v-if="item.resource?.uri">
                <span class="uri-label">URI:</span>
                <code class="uri-value">{{ item.resource.uri }}</code>
              </div>
              <div class="resource-mime" v-if="item.resource?.mimeType">
                <span class="mime-label">类型:</span>
                <span class="mime-value">{{ item.resource.mimeType }}</span>
              </div>
              <div class="resource-text" v-if="item.resource?.text">
                <pre class="text-body">{{ item.resource.text }}</pre>
              </div>
              <div class="resource-blob" v-else-if="item.resource?.blob">
                <span class="blob-info">二进制数据 ({{ formatBytes(item.resource.blob.length) }})</span>
              </div>
            </div>
          </div>
        </template>
        
        <!-- 嵌入资源类型 -->
        <template v-else-if="item.type === 'embedded_resource'">
          <div class="embedded-content">
            <div class="content-type-badge embedded-badge">
              <span class="badge-icon">📦</span>
              <span>嵌入资源</span>
            </div>
            <ContentRenderer v-if="item.resource" :content="[item.resource]" />
          </div>
        </template>
        
        <!-- 未知类型 -->
        <template v-else>
          <div class="unknown-content">
            <div class="content-type-badge unknown-badge">
              <span class="badge-icon">❓</span>
              <span>{{ item.type || '未知类型' }}</span>
            </div>
            <pre class="json-body">{{ formatJson(item) }}</pre>
          </div>
        </template>
      </div>
    </template>
    
    <!-- 非数组类型内容（直接显示JSON） -->
    <template v-else-if="content !== null && content !== undefined">
      <div class="raw-content">
        <div class="content-type-badge raw-badge">
          <span class="badge-icon">📄</span>
          <span>原始数据</span>
        </div>
        <pre class="json-body">{{ formatJson(content) }}</pre>
      </div>
    </template>
    
    <!-- 空内容 -->
    <template v-else>
      <div class="empty-content">
        <span class="empty-icon">📭</span>
        <span class="empty-text">无返回内容</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
interface ContentItem {
  type?: string;
  text?: string;
  data?: string;
  mimeType?: string;
  alt?: string;
  resource?: {
    uri?: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
}

const props = defineProps<{
  content: ContentItem[] | any;
}>();

const getItemClass = (item: ContentItem): string => {
  return `content-item-${item.type || 'unknown'}`;
};

const getImageSrc = (item: ContentItem): string => {
  if (!item.data) return '';
  // 如果已经是完整的 data URL，直接返回
  if (item.data.startsWith('data:')) {
    return item.data;
  }
  // 否则构建 data URL
  const mimeType = item.mimeType || 'image/png';
  return `data:${mimeType};base64,${item.data}`;
};

const handleImageError = (e: Event) => {
  const img = e.target as HTMLImageElement;
  img.style.display = 'none';
  // 显示占位符
  const parent = img.parentElement;
  if (parent) {
    parent.innerHTML = '<div class="image-error">图片加载失败</div>';
  }
};

const formatJson = (value: any): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const tryFormatJson = (text: string): string => {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text; // 不是 JSON 就原样返回
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
</script>

<style scoped>
.content-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.content-item {
  border-radius: 8px;
  overflow: hidden;
}

.content-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.badge-icon {
  font-size: 0.85rem;
}

.text-badge {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.image-badge {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.resource-badge {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.embedded-badge {
  background: rgba(139, 92, 246, 0.15);
  color: #8b5cf6;
}

.unknown-badge {
  background: rgba(100, 116, 139, 0.15);
  color: #64748b;
}

.raw-badge {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
}

.mime-type {
  margin-left: 4px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 0.7rem;
  font-family: monospace;
}

/* 文本内容 */
.text-content {
  padding: 12px;
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.15);
  border-radius: 8px;
}

.text-body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--foreground, #1a1a2e);
}

/* 图片内容 */
.image-content {
  padding: 12px;
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.15);
  border-radius: 8px;
}

.image-preview {
  display: flex;
  justify-content: center;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}

.image-preview img {
  max-width: 100%;
  max-height: 400px;
  border-radius: 4px;
  object-fit: contain;
}

.image-placeholder,
.image-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: #64748b;
  font-size: 0.85rem;
}

/* 资源内容 */
.resource-content {
  padding: 12px;
  background: rgba(245, 158, 11, 0.05);
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: 8px;
}

.resource-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.resource-uri,
.resource-mime {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.uri-label,
.mime-label {
  color: #94a3b8;
  min-width: 40px;
}

.uri-value {
  background: rgba(0, 0, 0, 0.3);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  word-break: break-all;
  color: #fcd34d;
}

.mime-value {
  color: #e2e8f0;
}

.resource-text {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(245, 158, 11, 0.2);
}

.blob-info {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-size: 0.85rem;
  color: #94a3b8;
}

/* 嵌入内容 */
.embedded-content {
  padding: 12px;
  background: rgba(139, 92, 246, 0.05);
  border: 1px solid rgba(139, 92, 246, 0.15);
  border-radius: 8px;
}

/* 未知/原始内容 */
.unknown-content,
.raw-content {
  padding: 12px;
  background: rgba(100, 116, 139, 0.05);
  border: 1px solid rgba(100, 116, 139, 0.15);
  border-radius: 8px;
}

.json-body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--foreground, #1a1a2e);
  max-height: 300px;
  overflow: auto;
}

/* 空内容 */
.empty-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #64748b;
  font-size: 0.9rem;
}

.empty-icon {
  font-size: 1.2rem;
}
</style>
