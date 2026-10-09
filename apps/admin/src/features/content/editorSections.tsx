import { useMemo, useState } from 'react';

import type {
  ContentRelationDto,
  ContentSourceLink,
  ContentType,
  Language,
  MediaRightsStatus,
  RelationType,
  SourceKind,
  TagDto,
  TypeExtension,
} from '@/api/types';
import type { CSSProperties, ReactNode } from 'react';

import {
  CONTENT_TYPES,
  EVENT_DATE_PRECISIONS,
  LANGUAGES,
  MEDIA_RIGHTS_STATUSES,
  PLACE_ACCURACIES,
  RELATION_TYPES,
  SOURCE_KINDS,
  VERIFICATION_STATUSES,
} from '@/api/types';
import { Badge } from '@/features/shared/Badge';
import { Button, ButtonRow } from '@/features/shared/Button';
import { Field } from '@/features/shared/Field';
import { EmptyState } from '@/features/shared/States';
import {
  card,
  dangerBanner,
  inputStyle,
  mutedText,
  row,
  stack,
  tableStyle,
} from '@/features/shared/styles';
import {
  SUMMARY_MAX,
  TITLE_MAX,
  isValidSlug,
  summaryLengthHint,
  titleLengthHint,
} from '@/features/shared/workflow';

/**
 * 编辑器八区（P1-10）。
 *
 * 八个区固定为：基础信息 / 正文 / 类型扩展 / 来源 / 版权与媒体 / 标签 / 关联内容 / SEO。
 * 这里只放"区"本身的表单与可见性规则；数据加载、自动保存、版本冲突在 EditorPage。
 *
 * 【已知简化】正文区目前是 **JSON 模式**（受控 textarea 承载 Tiptap JSON 字符串）。
 * 本任务明确不引入 Tiptap 依赖；后续任务一次性引入 Tiptap 后替换这一区，
 * 届时本文件里 BodySection 的 JSON 解析规则仍可复用。
 */

const TYPE_LABELS: Record<ContentType, string> = {
  PLACE: '地点',
  PERSON: '人物',
  EVENT: '事件',
  ARCHITECTURE: '建筑',
  TRADITION: '民俗传统',
  TOPIC: '专题',
  ROUTE: '路线',
};

const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  ARCHIVE: '档案',
  BOOK: '图书',
  ARTICLE: '文章',
  WEBSITE: '网站',
  ORAL: '口述 / 采访',
  OTHER: '其他',
};

const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  RELATED_TO: '相关',
  PART_OF: '属于',
  INFLUENCED: '影响',
  CONTINUES: '延续',
  REFERENCES: '引用',
  LOCATED_AT: '位于',
};

const RIGHTS_LABELS: Record<MediaRightsStatus, string> = {
  PUBLIC_DOMAIN: '公有领域',
  CC_BY: 'CC BY',
  CC_BY_SA: 'CC BY-SA',
  CC_BY_NC: 'CC BY-NC',
  CC_BY_NC_SA: 'CC BY-NC-SA',
  CC0: 'CC0',
  LICENSED: '已获授权',
  UNKNOWN: '未确认',
  RESTRICTED: '受限',
};

/** UNKNOWN / RESTRICTED 不得进入公开页面（AGENTS.md §3.6）。 */
export const UNCLEAR_RIGHTS: readonly MediaRightsStatus[] = ['UNKNOWN', 'RESTRICTED'];

export function isPubliclyUsableRights(status: MediaRightsStatus): boolean {
  return !UNCLEAR_RIGHTS.includes(status);
}

// ---------------------------------------------------------------------------
// 类型扩展字段可见性（随 type 动态切换）
// ---------------------------------------------------------------------------

export type ExtensionFieldKind = 'text' | 'textarea' | 'number' | 'date' | 'select';

export interface ExtensionFieldMeta {
  key: string;
  label: string;
  kind: ExtensionFieldKind;
  hint?: string;
  options?: readonly string[];
}

/** 每个内容类型对应的扩展字段（服务端 `typeExtensionSchema` 的前端镜像）。 */
export const EXTENSION_FIELDS: Record<ContentType, readonly ExtensionFieldMeta[]> = {
  PLACE: [
    { key: 'address', label: '地址', kind: 'text' },
    {
      key: 'accuracy',
      label: '坐标精度',
      kind: 'select',
      hint: 'UNKNOWN 时不得填精确经纬度（AGENTS.md §3.5）',
      options: PLACE_ACCURACIES,
    },
    { key: 'lon', label: '经度', kind: 'number' },
    { key: 'lat', label: '纬度', kind: 'number' },
    {
      key: 'verificationStatus',
      label: '核验状态',
      kind: 'select',
      options: VERIFICATION_STATUSES,
    },
  ],
  PERSON: [
    {
      key: 'birthText',
      label: '生年（文本）',
      kind: 'text',
      hint: '史料原文优先，不确定时保留原文表述',
    },
    { key: 'deathText', label: '卒年（文本）', kind: 'text' },
    { key: 'biographyNote', label: '生平说明', kind: 'textarea' },
  ],
  EVENT: [
    { key: 'startDate', label: '开始日期', kind: 'date' },
    { key: 'endDate', label: '结束日期', kind: 'date' },
    { key: 'datePrecision', label: '日期精度', kind: 'select', options: EVENT_DATE_PRECISIONS },
    {
      key: 'dateNote',
      label: '日期说明',
      kind: 'text',
      hint: '如「据《XX志》卷三，约清光绪年间」',
    },
  ],
  ARCHITECTURE: [
    { key: 'builtPeriod', label: '营建年代', kind: 'text' },
    { key: 'currentCondition', label: '现状', kind: 'textarea' },
    { key: 'heritageLevel', label: '保护级别', kind: 'text' },
  ],
  TRADITION: [
    { key: 'traditionType', label: '传统类型', kind: 'text', hint: '服务端必填' },
    { key: 'transmissionMethod', label: '传承方式', kind: 'textarea' },
  ],
  TOPIC: [{ key: 'curatorNote', label: '策展人按', kind: 'textarea' }],
  ROUTE: [
    { key: 'durationMinutes', label: '时长（分钟）', kind: 'number' },
    { key: 'distanceMeters', label: '距离（米）', kind: 'number' },
  ],
};

/** 当前 type 下应渲染哪些扩展字段。 */
export function visibleExtensionFields(type: ContentType): readonly ExtensionFieldMeta[] {
  return EXTENSION_FIELDS[type];
}

// ---------------------------------------------------------------------------
// 类型扩展：表单值 → API payload
// ---------------------------------------------------------------------------

export type ExtensionValues = Readonly<Record<string, string>>;

function textOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function numberOrNull(value: string | undefined): number | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 把扩展表单值收敛成服务端校验的 discriminated union。
 * 空字符串一律不下发（服务端 `.nullish()` 接受缺省）。
 * 返回 null 表示该 type 的必填项没填（TRADITION.traditionType）。
 */
export function buildExtension(type: ContentType, values: ExtensionValues): TypeExtension | null {
  switch (type) {
    case 'PLACE': {
      const address = textOrNull(values.address);
      const lon = numberOrNull(values.lon);
      const lat = numberOrNull(values.lat);
      const accuracy = values.accuracy ?? '';
      const verificationStatus = values.verificationStatus ?? '';
      return {
        kind: 'PLACE',
        ...(address === null ? {} : { address }),
        ...(lon === null ? {} : { lon }),
        ...(lat === null ? {} : { lat }),
        ...(accuracy === '' ? {} : { accuracy: accuracy as (typeof PLACE_ACCURACIES)[number] }),
        ...(verificationStatus === ''
          ? {}
          : { verificationStatus: verificationStatus as (typeof VERIFICATION_STATUSES)[number] }),
      };
    }
    case 'PERSON': {
      const birthText = textOrNull(values.birthText);
      const deathText = textOrNull(values.deathText);
      const biographyNote = textOrNull(values.biographyNote);
      return {
        kind: 'PERSON',
        ...(birthText === null ? {} : { birthText }),
        ...(deathText === null ? {} : { deathText }),
        ...(biographyNote === null ? {} : { biographyNote }),
      };
    }
    case 'EVENT': {
      const startDate = textOrNull(values.startDate);
      const endDate = textOrNull(values.endDate);
      const datePrecision = values.datePrecision ?? '';
      const dateNote = textOrNull(values.dateNote);
      return {
        kind: 'EVENT',
        ...(startDate === null ? {} : { startDate }),
        ...(endDate === null ? {} : { endDate }),
        ...(datePrecision === ''
          ? {}
          : { datePrecision: datePrecision as (typeof EVENT_DATE_PRECISIONS)[number] }),
        ...(dateNote === null ? {} : { dateNote }),
      };
    }
    case 'ARCHITECTURE': {
      const builtPeriod = textOrNull(values.builtPeriod);
      const currentCondition = textOrNull(values.currentCondition);
      const heritageLevel = textOrNull(values.heritageLevel);
      return {
        kind: 'ARCHITECTURE',
        ...(builtPeriod === null ? {} : { builtPeriod }),
        ...(currentCondition === null ? {} : { currentCondition }),
        ...(heritageLevel === null ? {} : { heritageLevel }),
      };
    }
    case 'TRADITION': {
      const traditionType = textOrNull(values.traditionType);
      if (traditionType === null) {
        return null;
      }
      const transmissionMethod = textOrNull(values.transmissionMethod);
      return {
        kind: 'TRADITION',
        traditionType,
        ...(transmissionMethod === null ? {} : { transmissionMethod }),
      };
    }
    case 'TOPIC': {
      const curatorNote = textOrNull(values.curatorNote);
      return { kind: 'TOPIC', ...(curatorNote === null ? {} : { curatorNote }) };
    }
    case 'ROUTE': {
      const durationMinutes = numberOrNull(values.durationMinutes);
      const distanceMeters = numberOrNull(values.distanceMeters);
      return {
        kind: 'ROUTE',
        ...(durationMinutes === null ? {} : { durationMinutes }),
        ...(distanceMeters === null ? {} : { distanceMeters }),
      };
    }
    default: {
      const exhaustive: never = type;
      throw new Error(`未处理的内容类型：${String(exhaustive)}`);
    }
  }
}

/** 从服务端返回的扩展（后端目前不随内容 DTO 返回）→ 表单值。留空即用默认值。 */
export function extensionToFormValues(extension: TypeExtension | null): Record<string, string> {
  const values: Record<string, string> = {};
  if (extension === null) {
    return values;
  }
  const entries = Object.entries(extension).filter(([key]) => key !== 'kind');
  for (const [key, value] of entries) {
    values[key] = value === null || value === undefined ? '' : String(value);
  }
  return values;
}

// ---------------------------------------------------------------------------
// 正文区：JSON 模式
// ---------------------------------------------------------------------------

export type BodyParseResult = { ok: true; value: unknown } | { ok: false; message: string };

export function parseBodyJson(text: string): BodyParseResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, message: '正文不能为空' };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, message: '正文必须是 JSON 对象（Tiptap document）' };
    }
    return { ok: true, value: parsed };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '未知错误';
    return { ok: false, message: `JSON 解析失败：${message}` };
  }
}

/** 「格式化 JSON」：只做缩进美化，不改内容。 */
export function formatBodyJson(text: string): string {
  const parsed = parseBodyJson(text);
  return parsed.ok ? JSON.stringify(parsed.value, null, 2) : text;
}

// ---------------------------------------------------------------------------
// 通用外壳
// ---------------------------------------------------------------------------

export interface SectionShellProps {
  index: number;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function SectionShell({ index, title, description, children, actions }: SectionShellProps) {
  const headingId = `section-${index}-title`;
  return (
    <section aria-labelledby={headingId} style={{ ...card, ...stack }}>
      <div style={row}>
        <h2 id={headingId} style={{ fontSize: '1.05rem', margin: 0 }}>
          {index}. {title}
        </h2>
        {actions}
      </div>
      <p style={mutedText}>{description}</p>
      {children}
    </section>
  );
}

function Select<T extends string>({
  id,
  describedBy,
  value,
  options,
  labels,
  onChange,
  disabled = false,
}: {
  id: string;
  describedBy: string | undefined;
  value: T;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      aria-describedby={describedBy}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
      style={inputStyle}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// 区 1：基础信息
// ---------------------------------------------------------------------------

export interface BasicsValue {
  title: string;
  subtitle: string;
  slug: string;
  type: ContentType;
  language: Language;
}

export interface BasicsSectionProps {
  value: BasicsValue;
  onChange: (next: BasicsValue) => void;
  /** 已发布 / 审核中内容禁止改 type（服务端按 type 关联扩展表）。 */
  typeLocked: boolean;
  disabled: boolean;
}

export function BasicsSection({ value, onChange, typeLocked, disabled }: BasicsSectionProps) {
  const typeOptions = typeLocked ? [value.type] : CONTENT_TYPES;
  return (
    <SectionShell
      index={1}
      title="基础信息"
      description="标题、slug 与类型决定公开页地址与索引方式；发布后 slug 变更需谨慎。"
    >
      <Field
        label="标题"
        required
        error={
          titleLengthHint(value.title) === 'error' && value.title.trim() === ''
            ? '标题不能为空'
            : null
        }
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            disabled={disabled}
            maxLength={TITLE_MAX}
            value={value.title}
            onChange={(event) => onChange({ ...value, title: event.target.value })}
            style={inputStyle}
          />
        )}
      </Field>
      <Field label="副标题">
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            disabled={disabled}
            maxLength={300}
            value={value.subtitle}
            onChange={(event) => onChange({ ...value, subtitle: event.target.value })}
            style={inputStyle}
          />
        )}
      </Field>
      <Field
        label="Slug"
        required
        hint="小写 ASCII、数字与单连字符，例如 qinhuai-river-night-market"
        error={isValidSlug(value.slug) ? null : 'slug 必须是小写 ASCII、数字与单连字符'}
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            disabled={disabled}
            value={value.slug}
            onChange={(event) => onChange({ ...value, slug: event.target.value })}
            style={inputStyle}
          />
        )}
      </Field>
      <Field
        label="类型"
        hint={typeLocked ? '该内容已进入审核流程，类型已锁定' : '类型决定第三区显示哪些扩展字段'}
      >
        {({ id, describedBy }) => (
          <Select
            id={id}
            describedBy={describedBy}
            value={value.type}
            options={typeOptions}
            labels={TYPE_LABELS}
            disabled={disabled || typeLocked}
            onChange={(next) => onChange({ ...value, type: next })}
          />
        )}
      </Field>
      <Field label="语言">
        {({ id, describedBy }) => (
          <Select
            id={id}
            describedBy={describedBy}
            value={value.language}
            options={LANGUAGES}
            disabled={disabled}
            onChange={(next) => onChange({ ...value, language: next })}
          />
        )}
      </Field>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// 区 2：正文（JSON 模式）
// ---------------------------------------------------------------------------

export function BodySection({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const parsed = useMemo(() => parseBodyJson(value), [value]);
  return (
    <SectionShell
      index={2}
      title="正文"
      description="当前为 JSON 模式：直接编辑 Tiptap document JSON。后续任务引入 Tiptap 后替换为富文本编辑器。"
      actions={<Badge tone="review">JSON 模式</Badge>}
    >
      <div style={dangerBanner}>
        <strong>简化说明</strong> · 本区尚未接入 Tiptap 富文本编辑器，保存前会做
        <code>JSON.parse</code> 校验，服务端仍会执行 Tiptap 节点白名单校验。
      </div>
      <Field
        label="正文 JSON"
        required
        error={parsed.ok ? null : parsed.message}
        hint='最小可用结构：{"type":"doc","content":[]}'
      >
        {({ id, describedBy, invalid }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            disabled={disabled}
            rows={16}
            spellCheck={false}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--nla-font-mono, monospace)' }}
          />
        )}
      </Field>
      <ButtonRow>
        <Button
          disabled={disabled || parsed.ok}
          onClick={() => onChange(formatBodyJson(value))}
          title={parsed.ok ? undefined : '当前 JSON 无法解析，无法格式化'}
        >
          格式化 JSON
        </Button>
        <span style={mutedText}>{parsed.ok ? 'JSON 校验通过' : 'JSON 校验未通过'}</span>
      </ButtonRow>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// 区 3：类型扩展
// ---------------------------------------------------------------------------

export function TypeExtensionSection({
  type,
  values,
  onChange,
  disabled,
}: {
  type: ContentType;
  values: ExtensionValues;
  onChange: (next: Record<string, string>) => void;
  disabled: boolean;
}) {
  const fields = visibleExtensionFields(type);
  const accuracy = values.accuracy;
  return (
    <SectionShell
      index={3}
      title="类型扩展"
      description={`当前类型「${TYPE_LABELS[type]}」的专有字段；切换类型会清空这些值。`}
    >
      {fields.length === 0 ? (
        <p style={mutedText}>该类型没有扩展字段。</p>
      ) : (
        <div style={stack}>
          {fields.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              {...(field.hint === undefined ? {} : { hint: field.hint })}
              required={type === 'TRADITION' && field.key === 'traditionType'}
            >
              {({ id, describedBy }) => (
                <ExtensionInput
                  field={field}
                  id={id}
                  describedBy={describedBy}
                  disabled={disabled}
                  value={values[field.key] ?? ''}
                  onChange={(next) => onChange({ ...values, [field.key]: next })}
                />
              )}
            </Field>
          ))}
          {type === 'PLACE' && accuracy === 'UNKNOWN' ? (
            <div style={dangerBanner}>
              坐标精度为 UNKNOWN 时不得填入精确经纬度；保存与发布都会被服务端校验拦截。
            </div>
          ) : null}
        </div>
      )}
    </SectionShell>
  );
}

function ExtensionInput({
  field,
  id,
  describedBy,
  disabled,
  value,
  onChange,
}: {
  field: ExtensionFieldMeta;
  id: string;
  describedBy: string | undefined;
  disabled: boolean;
  value: string;
  onChange: (next: string) => void;
}) {
  if (field.kind === 'select') {
    return (
      <select
        id={id}
        aria-describedby={describedBy}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      >
        <option value="">（未选择）</option>
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === 'textarea') {
    return (
      <textarea
        id={id}
        aria-describedby={describedBy}
        disabled={disabled}
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    );
  }
  return (
    <input
      id={id}
      aria-describedby={describedBy}
      disabled={disabled}
      type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
      step={field.kind === 'number' ? 'any' : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={inputStyle}
    />
  );
}

// ---------------------------------------------------------------------------
// 区 4：来源
// ---------------------------------------------------------------------------

export interface NewSourceValue {
  kind: SourceKind;
  title: string;
  author: string;
  publisher: string;
  publicationDate: string;
  url: string;
  citationText: string;
  verificationNote: string;
}

export interface AttachSourceValue {
  sourceId: string;
  claimScope: string;
  pageReference: string;
  isPrimary: boolean;
}

export function SourcesSection({
  links,
  newSource,
  attach,
  onNewSourceChange,
  onAttachChange,
  onCreate,
  onAttach,
  busy,
  error,
}: {
  links: readonly ContentSourceLink[];
  newSource: NewSourceValue;
  attach: AttachSourceValue;
  onNewSourceChange: (next: NewSourceValue) => void;
  onAttachChange: (next: AttachSourceValue) => void;
  /** 创建来源；resolve 新建的来源 id（null 表示创建失败，错误由父级展示）。 */
  onCreate: () => Promise<string | null>;
  onAttach: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [createdSourceId, setCreatedSourceId] = useState<string | null>(null);
  const claimScopeInvalid = attach.claimScope.trim().length === 0;

  return (
    <SectionShell
      index={4}
      title="来源"
      description="发布前至少需要一项来源（AGENTS.md §3.1）。来源必须真实可追溯，不确定时写明核验情况。"
    >
      {links.length === 0 ? (
        <EmptyState
          title="还没有关联来源"
          description="新建或选择一项来源，并写明它支撑的是哪一段论断（claimScope）。"
        />
      ) : (
        <table style={tableStyle}>
          <caption style={srOnlyCaption}>已关联的来源列表</caption>
          <thead>
            <tr>
              <th scope="col">来源</th>
              <th scope="col">支撑论断</th>
              <th scope="col">页码 / 位置</th>
              <th scope="col">主要来源</th>
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={link.source.id}>
                <td>
                  <Badge>{SOURCE_KIND_LABELS[link.source.kind]}</Badge> {link.source.title}
                  {link.source.author === null ? null : (
                    <span style={mutedText}> · {link.source.author}</span>
                  )}
                </td>
                <td>{link.claimScope}</td>
                <td>{link.pageReference ?? '—'}</td>
                <td>{link.isPrimary ? '是' : '否'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: '0.95rem', margin: 0 }}>新建来源</h3>
      <div style={stack}>
        <Field label="来源类型" required>
          {({ id, describedBy }) => (
            <Select
              id={id}
              describedBy={describedBy}
              value={newSource.kind}
              options={SOURCE_KINDS}
              labels={SOURCE_KIND_LABELS}
              disabled={busy}
              onChange={(next) => onNewSourceChange({ ...newSource, kind: next })}
            />
          )}
        </Field>
        <Field
          label="来源标题"
          required
          error={newSource.title.trim() === '' ? '来源标题不能为空' : null}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              disabled={busy}
              value={newSource.title}
              onChange={(event) => onNewSourceChange({ ...newSource, title: event.target.value })}
              style={inputStyle}
            />
          )}
        </Field>
        <div style={gridTwo}>
          <Field label="作者">
            {({ id }) => (
              <input
                id={id}
                disabled={busy}
                value={newSource.author}
                onChange={(event) =>
                  onNewSourceChange({ ...newSource, author: event.target.value })
                }
                style={inputStyle}
              />
            )}
          </Field>
          <Field label="出版方">
            {({ id }) => (
              <input
                id={id}
                disabled={busy}
                value={newSource.publisher}
                onChange={(event) =>
                  onNewSourceChange({ ...newSource, publisher: event.target.value })
                }
                style={inputStyle}
              />
            )}
          </Field>
        </div>
        <div style={gridTwo}>
          <Field label="出版日期" hint="YYYY-MM-DD">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                disabled={busy}
                type="date"
                value={newSource.publicationDate}
                onChange={(event) =>
                  onNewSourceChange({ ...newSource, publicationDate: event.target.value })
                }
                style={inputStyle}
              />
            )}
          </Field>
          <Field label="URL">
            {({ id }) => (
              <input
                id={id}
                disabled={busy}
                type="url"
                value={newSource.url}
                onChange={(event) => onNewSourceChange({ ...newSource, url: event.target.value })}
                style={inputStyle}
              />
            )}
          </Field>
        </div>
        <Field label="引用文本">
          {({ id }) => (
            <textarea
              id={id}
              disabled={busy}
              rows={3}
              value={newSource.citationText}
              onChange={(event) =>
                onNewSourceChange({ ...newSource, citationText: event.target.value })
              }
              style={inputStyle}
            />
          )}
        </Field>
        <Field label="核验说明" hint="例如：仅见二手转引，未核对原件">
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              disabled={busy}
              rows={2}
              value={newSource.verificationNote}
              onChange={(event) =>
                onNewSourceChange({ ...newSource, verificationNote: event.target.value })
              }
              style={inputStyle}
            />
          )}
        </Field>
        <ButtonRow>
          <Button
            variant="primary"
            busy={busy}
            disabled={newSource.title.trim() === ''}
            onClick={() => {
              void onCreate().then(setCreatedSourceId);
            }}
          >
            创建来源
          </Button>
          {createdSourceId === null ? null : (
            <span style={mutedText}>
              已创建来源 id：<code>{createdSourceId}</code>，可填入下方「来源 ID」完成关联
            </span>
          )}
        </ButtonRow>
      </div>

      <h3 style={{ fontSize: '0.95rem', margin: 0 }}>关联到本内容</h3>
      <div style={stack}>
        <Field
          label="来源 ID"
          required
          hint="填写刚创建的来源 ID；后端暂未提供来源检索端点，先用 ID 关联"
          error={attach.sourceId.trim() === '' ? '来源 ID 不能为空' : null}
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              disabled={busy}
              value={attach.sourceId ?? ''}
              onChange={(event) => onAttachChange({ ...attach, sourceId: event.target.value })}
              style={inputStyle}
            />
          )}
        </Field>
        <Field
          label="支撑论断（claimScope）"
          required
          hint="写清这条来源支撑的是哪一句 / 哪一段，而不是笼统写「整篇」"
          error={claimScopeInvalid ? '必须写明支撑的论断' : null}
        >
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              disabled={busy}
              rows={2}
              value={attach.claimScope}
              onChange={(event) => onAttachChange({ ...attach, claimScope: event.target.value })}
              style={inputStyle}
            />
          )}
        </Field>
        <div style={gridTwo}>
          <Field label="页码 / 位置">
            {({ id }) => (
              <input
                id={id}
                disabled={busy}
                value={attach.pageReference}
                onChange={(event) =>
                  onAttachChange({ ...attach, pageReference: event.target.value })
                }
                style={inputStyle}
              />
            )}
          </Field>
          <label style={row}>
            <input
              type="checkbox"
              checked={attach.isPrimary}
              disabled={busy}
              onChange={(event) => onAttachChange({ ...attach, isPrimary: event.target.checked })}
            />
            标为主要来源
          </label>
        </div>
        <ButtonRow>
          <Button
            busy={busy}
            disabled={claimScopeInvalid || attach.sourceId.trim() === ''}
            onClick={onAttach}
          >
            关联来源
          </Button>
        </ButtonRow>
        {error === null ? null : (
          <p role="alert" style={{ color: 'var(--app-warning-fg)' }}>
            {error}
          </p>
        )}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// 区 5：版权与媒体
// ---------------------------------------------------------------------------

export interface MediaCompleteValue {
  checksum: string;
  altText: string;
  rightsStatus: MediaRightsStatus;
  license: string;
  creditLine: string;
  creator: string;
  width: string;
  height: string;
}

export interface MediaIntake {
  fileName: string;
  mimeType: string;
  sizeBytes: string;
}

export function RightsMediaSection({
  intake,
  complete,
  onIntakeChange,
  onCompleteChange,
  onCreateIntent,
  onCompleteUpload,
  intent,
  result,
  busy,
  error,
}: {
  intake: MediaIntake;
  complete: MediaCompleteValue;
  onIntakeChange: (next: MediaIntake) => void;
  onCompleteChange: (next: MediaCompleteValue) => void;
  onCreateIntent: () => void;
  onCompleteUpload: () => void;
  intent: { mediaId: string; uploadUrl: string; expiresAt: string } | null;
  result: { id: string; rightsStatus: string; usableInPublic: boolean } | null;
  busy: boolean;
  error: string | null;
}) {
  const rightsUnclear = !isPubliclyUsableRights(complete.rightsStatus);
  const checksumValid = /^[0-9a-f]{64}$/.test(complete.checksum.trim());
  const sizeValid = Number(intake.sizeBytes) > 0;

  return (
    <SectionShell
      index={5}
      title="版权与媒体"
      description="版权状态未确认（UNKNOWN / RESTRICTED）的图片不得进入公开页面（AGENTS.md §3.6）。"
    >
      {rightsUnclear ? (
        <div role="alert" style={dangerBanner}>
          <strong>版权未澄清</strong> · {RIGHTS_LABELS[complete.rightsStatus]} 的素材不能公开发布，
          发布校验会返回 MEDIA_RIGHTS_NOT_CLEARED。请先确认授权或替换素材。
        </div>
      ) : null}

      <h3 style={{ fontSize: '0.95rem', margin: 0 }}>1) 申请上传意图</h3>
      <div style={stack}>
        <div style={gridTwo}>
          <Field label="文件名" required>
            {({ id }) => (
              <input
                id={id}
                disabled={busy}
                value={intake.fileName}
                onChange={(event) => onIntakeChange({ ...intake, fileName: event.target.value })}
                style={inputStyle}
              />
            )}
          </Field>
          <Field label="MIME 类型" required hint="仅允许 image/jpeg、image/png、image/webp">
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                disabled={busy}
                value={intake.mimeType}
                onChange={(event) => onIntakeChange({ ...intake, mimeType: event.target.value })}
                style={inputStyle}
              />
            )}
          </Field>
        </div>
        <Field
          label="大小（字节）"
          required
          error={intake.sizeBytes === '' ? null : sizeValid ? null : '必须是正整数'}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              disabled={busy}
              type="number"
              min={1}
              value={intake.sizeBytes}
              onChange={(event) => onIntakeChange({ ...intake, sizeBytes: event.target.value })}
              style={inputStyle}
            />
          )}
        </Field>
        <ButtonRow>
          <Button
            busy={busy}
            disabled={intake.fileName.trim() === '' || intake.mimeType.trim() === '' || !sizeValid}
            onClick={onCreateIntent}
          >
            申请上传凭证
          </Button>
        </ButtonRow>
        {intent === null ? null : (
          <div style={card}>
            <p style={mutedText}>
              mediaId：<code>{intent.mediaId}</code>
            </p>
            <p style={mutedText}>
              uploadUrl：<code>{intent.uploadUrl}</code>
            </p>
            <p style={mutedText}>有效期至 {intent.expiresAt}</p>
            <p style={mutedText}>
              说明：对象存储上传目标在 P2 接入，本阶段只签发意图并回传占位路径。
            </p>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: '0.95rem', margin: 0 }}>2) 确认上传与版权信息</h3>
      <div style={stack}>
        <Field
          label="Checksum（sha256，64 位小写十六进制）"
          required
          error={
            complete.checksum.trim() === ''
              ? null
              : checksumValid
                ? null
                : '必须是 64 位小写十六进制'
          }
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              disabled={busy}
              value={complete.checksum}
              onChange={(event) => onCompleteChange({ ...complete, checksum: event.target.value })}
              style={inputStyle}
            />
          )}
        </Field>
        <Field
          label="替代文本（altText）"
          required
          error={complete.altText.trim() === '' ? '替代文本不能为空' : null}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              disabled={busy}
              value={complete.altText}
              onChange={(event) => onCompleteChange({ ...complete, altText: event.target.value })}
              style={inputStyle}
            />
          )}
        </Field>
        <Field label="版权状态" required>
          {({ id, describedBy }) => (
            <Select
              id={id}
              describedBy={describedBy}
              value={complete.rightsStatus}
              options={MEDIA_RIGHTS_STATUSES}
              labels={RIGHTS_LABELS}
              disabled={busy}
              onChange={(next) => onCompleteChange({ ...complete, rightsStatus: next })}
            />
          )}
        </Field>
        <div style={gridTwo}>
          <Field label="许可协议">
            {({ id }) => (
              <input
                id={id}
                disabled={busy}
                value={complete.license}
                onChange={(event) => onCompleteChange({ ...complete, license: event.target.value })}
                style={inputStyle}
              />
            )}
          </Field>
          <Field label="署名（creditLine）">
            {({ id }) => (
              <input
                id={id}
                disabled={busy}
                value={complete.creditLine}
                onChange={(event) =>
                  onCompleteChange({ ...complete, creditLine: event.target.value })
                }
                style={inputStyle}
              />
            )}
          </Field>
        </div>
        <div style={gridTwo}>
          <Field label="作者">
            {({ id }) => (
              <input
                id={id}
                disabled={busy}
                value={complete.creator}
                onChange={(event) => onCompleteChange({ ...complete, creator: event.target.value })}
                style={inputStyle}
              />
            )}
          </Field>
          <div style={gridTwo}>
            <Field label="宽（px）">
              {({ id }) => (
                <input
                  id={id}
                  disabled={busy}
                  type="number"
                  min={1}
                  value={complete.width}
                  onChange={(event) => onCompleteChange({ ...complete, width: event.target.value })}
                  style={inputStyle}
                />
              )}
            </Field>
            <Field label="高（px）">
              {({ id }) => (
                <input
                  id={id}
                  disabled={busy}
                  type="number"
                  min={1}
                  value={complete.height}
                  onChange={(event) =>
                    onCompleteChange({ ...complete, height: event.target.value })
                  }
                  style={inputStyle}
                />
              )}
            </Field>
          </div>
        </div>
        <ButtonRow>
          <Button
            busy={busy}
            disabled={intent === null || !checksumValid || complete.altText.trim() === ''}
            onClick={onCompleteUpload}
            title={intent === null ? '请先申请上传意图' : undefined}
          >
            确认上传完成
          </Button>
        </ButtonRow>
        {result === null ? null : (
          <div style={card}>
            <p style={{ margin: 0 }}>
              <Badge tone={result.usableInPublic ? 'published' : 'danger'}>
                {result.usableInPublic ? '可用于公开页面' : '不可用于公开页面'}
              </Badge>{' '}
              mediaId：<code>{result.id}</code> · rightsStatus：<code>{result.rightsStatus}</code>
            </p>
          </div>
        )}
        {error === null ? null : (
          <p role="alert" style={{ color: 'var(--app-warning-fg)' }}>
            {error}
          </p>
        )}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// 区 6：标签
// ---------------------------------------------------------------------------

export function TagsSection({
  tags,
  slug,
  displayName,
  onChange,
  onAttach,
  busy,
  error,
}: {
  tags: readonly TagDto[];
  slug: string;
  displayName: string;
  onChange: (next: { slug: string; displayName: string }) => void;
  onAttach: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <SectionShell
      index={6}
      title="标签"
      description="标签用于聚合检索；slug 全局唯一，重复添加等同于复用已有标签。"
    >
      {tags.length === 0 ? (
        <EmptyState title="还没有标签" description="添加标签便于在列表与前台按主题聚合内容。" />
      ) : (
        <ul style={{ ...row, listStyle: 'none', padding: 0, margin: 0 }}>
          {tags.map((tag) => (
            <li key={tag.slug}>
              <Badge>
                {tag.displayName} · {tag.slug}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div style={stack}>
        <div style={gridTwo}>
          <Field label="标签 slug" required error={slug.trim() === '' ? 'slug 不能为空' : null}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                disabled={busy}
                value={slug}
                onChange={(event) => onChange({ slug: event.target.value, displayName })}
                style={inputStyle}
              />
            )}
          </Field>
          <Field
            label="显示名"
            required
            error={displayName.trim() === '' ? '显示名不能为空' : null}
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                disabled={busy}
                value={displayName}
                onChange={(event) => onChange({ slug, displayName: event.target.value })}
                style={inputStyle}
              />
            )}
          </Field>
        </div>
        <ButtonRow>
          <Button
            variant="primary"
            busy={busy}
            disabled={slug.trim() === '' || displayName.trim() === ''}
            onClick={onAttach}
          >
            添加标签
          </Button>
        </ButtonRow>
        {error === null ? null : (
          <p role="alert" style={{ color: 'var(--app-warning-fg)' }}>
            {error}
          </p>
        )}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// 区 7：关联内容
// ---------------------------------------------------------------------------

export function RelationsSection({
  relations,
  targetContentId,
  relationType,
  directionNote,
  onChange,
  onCreate,
  busy,
  error,
}: {
  relations: readonly ContentRelationDto[];
  targetContentId: string;
  relationType: RelationType;
  directionNote: string;
  onChange: (next: {
    targetContentId: string;
    relationType: RelationType;
    directionNote: string;
  }) => void;
  onCreate: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <SectionShell
      index={7}
      title="关联内容"
      description="关联关系由受控字典约束；方向说明用于避免把有向关系读成双向。"
    >
      {relations.length === 0 ? (
        <EmptyState
          title="还没有关联内容"
          description="把人物与地点、事件与地点等关系连起来，便于前台串联阅读。"
        />
      ) : (
        <ul style={{ ...stack, listStyle: 'none', padding: 0, margin: 0 }}>
          {relations.map((relation) => (
            <li key={`${relation.targetContentId}-${relation.relationType}`} style={row}>
              <Badge>
                {RELATION_TYPE_LABELS[relation.relationType as RelationType] ??
                  relation.relationType}
              </Badge>
              <code>{relation.targetContentId}</code>
              <span style={mutedText}>{relation.directionNote ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
      <div style={stack}>
        <Field
          label="目标内容 ID"
          required
          error={targetContentId.trim() === '' ? '目标内容 ID 不能为空' : null}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              disabled={busy}
              value={targetContentId}
              onChange={(event) =>
                onChange({ targetContentId: event.target.value, relationType, directionNote })
              }
              style={inputStyle}
            />
          )}
        </Field>
        <Field label="关系类型" required>
          {({ id, describedBy }) => (
            <Select
              id={id}
              describedBy={describedBy}
              value={relationType}
              options={RELATION_TYPES}
              labels={RELATION_TYPE_LABELS}
              disabled={busy}
              onChange={(next) => onChange({ targetContentId, relationType: next, directionNote })}
            />
          )}
        </Field>
        <Field label="方向说明">
          {({ id }) => (
            <input
              id={id}
              disabled={busy}
              value={directionNote}
              onChange={(event) =>
                onChange({ targetContentId, relationType, directionNote: event.target.value })
              }
              style={inputStyle}
            />
          )}
        </Field>
        <ButtonRow>
          <Button busy={busy} disabled={targetContentId.trim() === ''} onClick={onCreate}>
            添加关联
          </Button>
        </ButtonRow>
        {error === null ? null : (
          <p role="alert" style={{ color: 'var(--app-warning-fg)' }}>
            {error}
          </p>
        )}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// 区 8：SEO 与可分享
// ---------------------------------------------------------------------------

export function SeoSection({
  slug,
  title,
  summary,
  onSummaryChange,
}: {
  slug: string;
  title: string;
  summary: string;
  onSummaryChange: (next: string) => void;
}) {
  const titleHint = titleLengthHint(title);
  const summaryHint = summaryLengthHint(summary);
  return (
    <SectionShell
      index={8}
      title="SEO 与可分享"
      description="公开页路径由 slug 决定；标题与摘要同时用于分享卡片。"
    >
      <Field label="摘要（summary）" hint={`用于列表摘要与分享卡片，最多 ${SUMMARY_MAX} 字`}>
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            rows={3}
            value={summary}
            onChange={(event) => onSummaryChange(event.target.value)}
            style={inputStyle}
          />
        )}
      </Field>
      <dl style={{ ...stack, margin: 0 }}>
        <div style={row}>
          <dt style={{ fontWeight: 600 }}>公开路径预览</dt>
          <dd style={{ margin: 0 }}>
            <code>/contents/{slug === '' ? '<slug>' : slug}</code>
          </dd>
        </div>
        <div style={row}>
          <dt style={{ fontWeight: 600 }}>标题长度</dt>
          <dd style={{ margin: 0 }}>
            <Badge
              tone={titleHint === 'ok' ? 'published' : titleHint === 'warn' ? 'review' : 'danger'}
            >
              {title.length} / {TITLE_MAX}
            </Badge>
          </dd>
        </div>
        <div style={row}>
          <dt style={{ fontWeight: 600 }}>摘要长度</dt>
          <dd style={{ margin: 0 }}>
            <Badge
              tone={
                summaryHint === 'ok' ? 'published' : summaryHint === 'warn' ? 'review' : 'danger'
              }
            >
              {summary.length} / {SUMMARY_MAX}
            </Badge>
          </dd>
        </div>
      </dl>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// 局部样式
// ---------------------------------------------------------------------------

const gridTwo: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
  gap: 'var(--app-space-sm)',
};

const srOnlyCaption: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

export { SOURCE_KIND_LABELS, TYPE_LABELS, RIGHTS_LABELS };
