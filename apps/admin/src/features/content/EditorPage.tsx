import { useCallback, useEffect, useRef, useState } from 'react';

import type { RevisionPage, ReviewActionPage, SourceSearchPage } from '@nanking-atlas/api-contract';

import type {
  AdminContentDto,
  AdminContentPatch,
  ContentAction,
  ContentRelationDto,
  ContentSourceLink,
  ContentType,
  Language,
  MediaCompleteDto,
  ReadinessResult,
  RelationTargetItem,
  RelationType,
  TagDto,
  TagWithUsage,
  TypeExtension,
  UploadIntentDto,
} from '@/api/types';
import type { ConflictVersionInfo } from '@/features/content/ConflictDialog';
import type {
  AttachSourceValue,
  BasicsValue,
  MediaCompleteValue,
  MediaIntake,
  NewSourceValue,
} from '@/features/content/editorSections';
import type { SourceSearchRequest } from '@/features/content/SourcePicker';
import type { ReadinessState } from '@/features/review/ReviewPanel';
import type { SessionUser } from '@/features/shared/session';

import { contentApi, isApiAuthError, isApiError, isAbortError, libraryApi } from '@/api/client';
import { CONTENT_VERSION_CONFLICT } from '@/api/types';
import {
  AutosaveStatus,
  useAutosaveController,
  useUnsavedChangesWarning,
} from '@/features/content/AutosaveStatus';
import { ConflictDialog, readConflictVersions } from '@/features/content/ConflictDialog';
import {
  BasicsSection,
  BodySection,
  RelationsSection,
  RightsMediaSection,
  SeoSection,
  SourcesSection,
  TagsSection,
  TypeExtensionSection,
  buildExtension,
  parseBodyJson,
} from '@/features/content/editorSections';
import { RouteStopEditor } from '@/features/content/RouteStopEditor';
import { ReviewPanel } from '@/features/review/ReviewPanel';
import { StatusBadge } from '@/features/shared/Badge';
import { Button } from '@/features/shared/Button';
import { formatDateTime } from '@/features/shared/datetime';
import { navigate } from '@/features/shared/router';
import { ErrorState, Loading } from '@/features/shared/States';
import { card, dangerBanner, inputStyle, mutedText, row, stack } from '@/features/shared/styles';

/**
 * 编辑器页（P1-10）：八区 + 自动保存 + 版本冲突 + 审核面板。
 *
 * 关键约束：
 * - 每次保存都带 `If-Match: W/"<version>"`（服务端乐观锁）；409 交给冲突对话框，
 *   **绝不静默覆盖**（AGENTS.md §5.5）。
 * - 自动保存只保存可编辑字段；来源 / 标签 / 关联 / 媒体是独立端点，改动即时提交。
 * - 发布与审核动作一律走 ReviewPanel → `POST /transition`，前端不改状态字段。
 */

interface DraftState {
  title: string;
  subtitle: string;
  summary: string;
  slug: string;
  type: ContentType;
  language: Language;
  bodyText: string;
  extensionValues: Record<string, string>;
}

const EMPTY_DOC = '{\n  "type": "doc",\n  "content": []\n}';

function toDraft(content: AdminContentDto): DraftState {
  return {
    title: content.title,
    subtitle: content.subtitle ?? '',
    summary: content.summary ?? '',
    slug: content.slug,
    type: content.type,
    language: content.language === 'EN' ? 'EN' : 'ZH',
    bodyText: JSON.stringify(content.body, null, 2),
    extensionValues: {},
  };
}

function toBasics(draft: DraftState): BasicsValue {
  return {
    title: draft.title,
    subtitle: draft.subtitle,
    slug: draft.slug,
    type: draft.type,
    language: draft.language,
  };
}

function patchFromDraft(draft: DraftState, extension: TypeExtension): AdminContentPatch {
  const body = parseBodyJson(draft.bodyText);
  return {
    title: draft.title.trim(),
    subtitle: draft.subtitle.trim() === '' ? null : draft.subtitle.trim(),
    summary: draft.summary.trim() === '' ? null : draft.summary.trim(),
    slug: draft.slug.trim(),
    ...(body.ok ? { body: body.value } : {}),
    extension,
  };
}

function toDiffSource(draft: DraftState): {
  title: string;
  subtitle: string | null;
  summary: string | null;
  slug: string;
  body: unknown;
} {
  const body = parseBodyJson(draft.bodyText);
  return {
    title: draft.title,
    subtitle: draft.subtitle.trim() === '' ? null : draft.subtitle,
    summary: draft.summary.trim() === '' ? null : draft.summary,
    slug: draft.slug,
    body: body.ok ? body.value : draft.bodyText,
  };
}

function isVersionConflict(error: unknown): boolean {
  return isApiError(error) && error.code === CONTENT_VERSION_CONFLICT;
}

function describeError(cause: unknown): { message: string; requestId: string; forbidden: boolean } {
  if (isApiError(cause)) {
    return {
      message: cause.message,
      requestId: cause.requestId,
      forbidden: cause.status === 403,
    };
  }
  return { message: '网络异常，请检查 API 是否可访问', requestId: '-', forbidden: false };
}

/** 从 `POST /admin/sources` 的返回值里取 id；形状不认识就返回 null（不编造）。 */
function pickId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || !('id' in raw)) {
    return null;
  }
  const id = raw.id;
  return typeof id === 'string' ? id : null;
}

export interface EditorPageProps {
  contentId: string;
  user: SessionUser;
  onUnauthorized: () => void;
}

export function EditorPage({ contentId, user, onUnauthorized }: EditorPageProps) {
  const isNew = contentId === 'new';
  const [content, setContent] = useState<AdminContentDto | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [version, setVersion] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    isNew ? 'ready' : 'loading',
  );
  const [pageError, setPageError] = useState<{
    message: string;
    requestId: string;
    forbidden: boolean;
  } | null>(null);

  // ---- 来源 / 标签 / 关联 / 媒体 ----
  const [links, setLinks] = useState<ContentSourceLink[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [relations, setRelations] = useState<ContentRelationDto[]>([]);
  // FD-008：标签库检索结果（带使用次数）与关系目标候选，避免手填 ID。
  const [availableTags, setAvailableTags] = useState<TagWithUsage[]>([]);
  const [relationTargets, setRelationTargets] = useState<RelationTargetItem[]>([]);
  const [sideBusy, setSideBusy] = useState(false);
  const [sideError, setSideError] = useState<string | null>(null);
  const [newSource, setNewSource] = useState<NewSourceValue>({
    kind: 'ARCHIVE',
    title: '',
    author: '',
    publisher: '',
    publicationDate: '',
    url: '',
    citationText: '',
    verificationNote: '',
  });
  const [attach, setAttach] = useState<AttachSourceValue>({
    sourceId: '',
    claimScope: '',
    pageReference: '',
    isPrimary: false,
  });
  const [tagForm, setTagForm] = useState({ slug: '', displayName: '' });
  const [relationForm, setRelationForm] = useState<{
    targetContentId: string;
    relationType: RelationType;
    directionNote: string;
  }>({
    targetContentId: '',
    relationType: 'RELATED_TO',
    directionNote: '',
  });
  const [intake, setIntake] = useState<MediaIntake>({
    fileName: '',
    mimeType: 'image/jpeg',
    sizeBytes: '',
  });
  const [intent, setIntent] = useState<UploadIntentDto | null>(null);
  const [mediaResult, setMediaResult] = useState<MediaCompleteDto | null>(null);
  const [mediaForm, setMediaForm] = useState<MediaCompleteValue>({
    checksum: '',
    altText: '',
    rightsStatus: 'UNKNOWN',
    license: '',
    creditLine: '',
    creator: '',
    width: '',
    height: '',
  });

  // ---- 审核 ----
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [readinessState, setReadinessState] = useState<ReadinessState>('idle');
  const [busyAction, setBusyAction] = useState<ContentAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ---- 版本与审核历史（FD-001）----
  const [revisions, setRevisions] = useState<RevisionPage | null>(null);
  const [reviewActions, setReviewActions] = useState<ReviewActionPage | null>(null);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>(
    'loading',
  );
  const [historyError, setHistoryError] = useState<{ message: string; requestId: string | null }>({
    message: '',
    requestId: null,
  });
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  // 游标分页的下一页位置；两个端点各自独立翻页。
  const [nextRevisionCursor, setNextRevisionCursor] = useState<string | null>(null);
  const [nextReviewCursor, setNextReviewCursor] = useState<string | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(
    async (id: string) => {
      historyAbortRef.current?.abort();
      const controller = new AbortController();
      historyAbortRef.current = controller;
      setHistoryState('loading');
      setHistoryError({ message: '', requestId: null });
      try {
        const [revisionPage, reviewPage] = await Promise.all([
          contentApi.listRevisions(id, undefined, controller.signal),
          contentApi.listReviewActions(id, undefined, controller.signal),
        ]);
        setRevisions(revisionPage);
        setReviewActions(reviewPage);
        setNextRevisionCursor(revisionPage.nextCursor);
        setNextReviewCursor(reviewPage.nextCursor);
        setHistoryState('ready');
      } catch (cause) {
        if (isAbortError(cause)) {
          return;
        }
        if (isApiAuthError(cause)) {
          onUnauthorized();
          return;
        }
        if (isApiError(cause) && cause.status === 403) {
          setHistoryState('forbidden');
          setHistoryError({ message: cause.message, requestId: cause.requestId });
          return;
        }
        setHistoryState('error');
        setHistoryError({
          message: cause instanceof Error ? cause.message : '版本历史加载失败',
          requestId: isApiError(cause) ? cause.requestId : null,
        });
      } finally {
        if (historyAbortRef.current === controller) {
          historyAbortRef.current = null;
        }
      }
    },
    [onUnauthorized],
  );

  /** 追加下一页：服务端游标是不透明的，原样回传，不在本地拼。 */
  const loadMoreHistory = useCallback(
    async (kind: 'revisions' | 'reviewActions') => {
      const cursor = kind === 'revisions' ? nextRevisionCursor : nextReviewCursor;
      if (cursor === null) {
        return;
      }
      setHistoryLoadingMore(true);
      try {
        if (kind === 'revisions') {
          const page = await contentApi.listRevisions(contentId, cursor);
          setRevisions((prev) =>
            prev === null ? page : { ...page, items: [...prev.items, ...page.items] },
          );
          setNextRevisionCursor(page.nextCursor);
        } else {
          const page = await contentApi.listReviewActions(contentId, cursor);
          setReviewActions((prev) =>
            prev === null ? page : { ...page, items: [...prev.items, ...page.items] },
          );
          setNextReviewCursor(page.nextCursor);
        }
      } catch (cause) {
        if (isApiError(cause)) {
          setHistoryError({ message: cause.message, requestId: cause.requestId });
          setHistoryState('error');
        }
      } finally {
        setHistoryLoadingMore(false);
      }
    },
    [contentId, nextRevisionCursor, nextReviewCursor],
  );

  useEffect(() => {
    if (!isNew) {
      void loadHistory(contentId);
    }
    return () => {
      historyAbortRef.current?.abort();
    };
  }, [contentId, isNew, loadHistory]);

  // ---- 冲突 ----
  const [conflict, setConflict] = useState<ConflictVersionInfo | null>(null);
  const [conflictServer, setConflictServer] = useState<ReturnType<typeof toDiffSource> | null>(
    null,
  );
  const [conflictBusy, setConflictBusy] = useState(false);

  const draftRef = useRef<DraftState | null>(null);
  draftRef.current = draft;
  const versionRef = useRef(version);
  versionRef.current = version;

  const refreshSideData = useCallback(
    async (id: string) => {
      try {
        const [sourceLinks, contentTags, contentRelations] = await Promise.all([
          contentApi.listSources(id),
          contentApi.listTags(id),
          contentApi.listRelations(id),
        ]);
        setLinks(sourceLinks);
        setTags(contentTags);
        setRelations(contentRelations);
      } catch (cause) {
        if (isApiAuthError(cause)) {
          onUnauthorized();
          return;
        }
        setSideError(describeError(cause).message);
      }
    },
    [onUnauthorized],
  );

  const loadContent = useCallback(
    async (id: string) => {
      setLoadState('loading');
      setPageError(null);
      try {
        const data = await contentApi.get(id);
        setContent(data);
        setVersion(data.version);
        setDraft(toDraft(data));
        setLoadState('ready');
        await refreshSideData(id);
      } catch (cause) {
        if (isApiAuthError(cause)) {
          onUnauthorized();
          return;
        }
        setPageError(describeError(cause));
        setLoadState('error');
      }
    },
    [onUnauthorized, refreshSideData],
  );

  useEffect(() => {
    if (!isNew) {
      void loadContent(contentId);
    }
  }, [contentId, isNew, loadContent]);

  // ---- 自动保存 ----
  const handleSaveError = useCallback(
    (error: unknown) => {
      if (isApiError(error) && error.code === CONTENT_VERSION_CONFLICT) {
        const info = readConflictVersions(error.details, versionRef.current);
        setConflict({ ...info, serverUpdatedAt: content?.updatedAt ?? null });
        setConflictServer(null);
        // 冲突时顺手拉一份服务端最新内容，供"查看差异"并排展示。
        void contentApi
          .get(contentId)
          .then((server) => {
            setContent(server);
            setConflictServer(toDiffSource(toDraft(server)));
            setConflict((prev) =>
              prev === null ? null : { ...prev, serverUpdatedAt: server.updatedAt },
            );
          })
          .catch(() => {
            setConflictServer(null);
          });
        return;
      }
      setActionError(describeError(error).message);
    },
    [content?.updatedAt, contentId],
  );

  const { controller, state: autosaveState } = useAutosaveController({
    save: async (signal) => {
      const current = draftRef.current;
      if (current === null) {
        return;
      }
      const ext = buildExtension(current.type, current.extensionValues);
      if (ext === null) {
        throw new Error('民俗传统类型必须填写「传统类型」');
      }
      const body = parseBodyJson(current.bodyText);
      if (!body.ok) {
        throw new Error(body.message);
      }
      const updated = await contentApi.update(
        contentId,
        patchFromDraft(current, ext),
        versionRef.current,
        signal,
      );
      setContent(updated);
      setVersion(updated.version);
    },
    onError: handleSaveError,
  });

  useUnsavedChangesWarning(controller.hasUnsavedChanges());

  const markDirty = useCallback(
    (next: DraftState) => {
      setDraft(next);
      controller.schedule();
    },
    [controller],
  );

  // ---- 来源 / 标签 / 关联 / 媒体操作 ----
  // 统一包装：失败时把错误写进 sideError 并返回 null，成功时返回任务结果。
  const runSideTask = useCallback(
    async <T,>(task: () => Promise<T>): Promise<T | null> => {
      setSideBusy(true);
      setSideError(null);
      try {
        return await task();
      } catch (cause) {
        if (isApiAuthError(cause)) {
          onUnauthorized();
          return null;
        }
        setSideError(describeError(cause).message);
        return null;
      } finally {
        setSideBusy(false);
      }
    },
    [onUnauthorized],
  );

  /**
   * 来源库检索（FD-002）。
   *
   * 刻意**不**走 `runSideTask`：那会劫持 `sideError` / `sideBusy`，
   * 让一次检索失败覆盖掉整个来源区的错误提示。选择器自己管自己的状态。
   * 会话失效仍然交给 `onUnauthorized` —— 那不是局部错误。
   */
  const searchSources = useCallback(
    async (request: SourceSearchRequest, signal?: AbortSignal): Promise<SourceSearchPage> => {
      try {
        return await libraryApi.searchSources(request, signal);
      } catch (cause) {
        if (isApiAuthError(cause)) {
          onUnauthorized();
        }
        throw cause;
      }
    },
    [onUnauthorized],
  );

  /**
   * 标签库检索（FD-008）。
   *
   * 走 `runSideTask` 让失败统一进 `sideError`，与其它侧栏操作一致的错误呈现。
   */
  const searchTags = useCallback(async () => {
    await runSideTask(async () => {
      const page = await libraryApi.listAllTags();
      setAvailableTags(page.items);
    });
  }, [runSideTask]);

  /** 关系目标检索（FD-008）：替代手填内容 ID。 */
  const searchRelationTargets = useCallback(async () => {
    await runSideTask(async () => {
      const page = await libraryApi.searchRelationTargets();
      setRelationTargets(page.items);
    });
  }, [runSideTask]);

  const createSource = useCallback(
    async (): Promise<string | null> =>
      runSideTask(async () => {
        const raw = await libraryApi.createSource({
          kind: newSource.kind,
          title: newSource.title.trim(),
          ...(newSource.author.trim() === '' ? {} : { author: newSource.author.trim() }),
          ...(newSource.publisher.trim() === '' ? {} : { publisher: newSource.publisher.trim() }),
          ...(newSource.publicationDate === ''
            ? {}
            : { publicationDate: newSource.publicationDate }),
          ...(newSource.url.trim() === '' ? {} : { url: newSource.url.trim() }),
          ...(newSource.citationText.trim() === ''
            ? {}
            : { citationText: newSource.citationText.trim() }),
          ...(newSource.verificationNote.trim() === ''
            ? {}
            : { verificationNote: newSource.verificationNote.trim() }),
        });
        return pickId(raw);
      }),
    [newSource, runSideTask],
  );

  // ---- 审核动作 ----
  const checkReadiness = useCallback(async () => {
    setReadinessState('loading');
    try {
      const result = await contentApi.readiness(contentId);
      setReadiness(result);
      setReadinessState('loaded');
    } catch (cause) {
      if (isApiAuthError(cause)) {
        onUnauthorized();
        return;
      }
      setReadiness(null);
      setReadinessState('error');
    }
  }, [contentId, onUnauthorized]);

  const runTransition = useCallback(
    async (action: ContentAction, reason?: string) => {
      setBusyAction(action);
      setActionError(null);
      try {
        if (controller.hasUnsavedChanges()) {
          await controller.flush();
        }
        const updated = await contentApi.transition(contentId, action, reason);
        setContent(updated);
        setVersion(updated.version);
        setReadiness(null);
        setReadinessState('idle');
        await refreshSideData(contentId);
      } catch (cause) {
        if (isApiAuthError(cause)) {
          onUnauthorized();
          return;
        }
        setActionError(describeError(cause).message);
      } finally {
        setBusyAction(null);
      }
    },
    [contentId, controller, refreshSideData, onUnauthorized],
  );

  // ---- 冲突处理 ----
  const reloadFromServer = useCallback(async () => {
    setConflictBusy(true);
    try {
      await controller.flush().catch(() => undefined);
      controller.cancel();
      await loadContent(contentId);
      setConflict(null);
      setConflictServer(null);
    } finally {
      setConflictBusy(false);
    }
  }, [controller, contentId, loadContent]);

  const overwriteServer = useCallback(async () => {
    const current = draftRef.current;
    if (current === null) {
      return;
    }
    setConflictBusy(true);
    try {
      // 用服务端最新 version 重试乐观锁；内容仍是本地版本。
      const server = await contentApi.get(contentId);
      const ext = buildExtension(current.type, current.extensionValues);
      if (ext === null) {
        setActionError('民俗传统类型必须填写「传统类型」');
        return;
      }
      const updated = await contentApi.update(
        contentId,
        patchFromDraft(current, ext),
        server.version,
      );
      setContent(updated);
      setVersion(updated.version);
      setDraft(current);
      setConflict(null);
      setConflictServer(null);
      await refreshSideData(contentId);
    } catch (cause) {
      if (isApiAuthError(cause)) {
        onUnauthorized();
        return;
      }
      setActionError(describeError(cause).message);
      if (isVersionConflict(cause)) {
        setConflict(
          readConflictVersions(isApiError(cause) ? cause.details : undefined, versionRef.current),
        );
      }
    } finally {
      setConflictBusy(false);
    }
  }, [contentId, refreshSideData, onUnauthorized]);

  if (loadState === 'loading') {
    return <Loading label="正在加载内容…" />;
  }

  if (loadState === 'error' && pageError !== null) {
    return (
      <ErrorState
        title={pageError.forbidden ? '没有权限查看该内容' : '内容加载失败'}
        message={pageError.message}
        requestId={pageError.requestId}
        forbidden={pageError.forbidden}
        onRetry={() => void loadContent(contentId)}
      />
    );
  }

  if (isNew) {
    return (
      <NewContentForm
        onUnauthorized={onUnauthorized}
        onCreated={(created) => navigate(`/contents/${encodeURIComponent(created.id)}`)}
      />
    );
  }

  if (content === null || draft === null) {
    return (
      <ErrorState
        title="内容不可用"
        message="未能读取到内容数据，请返回列表重试。"
        onRetry={() => navigate('/contents')}
      />
    );
  }

  const readOnly = content.status !== 'DRAFT';
  const localForDiff = toDiffSource(draft);

  return (
    <div style={stack}>
      <div style={row}>
        <h1 style={{ fontSize: '1.3rem', margin: 0 }}>{content.title}</h1>
        <StatusBadge status={content.status} />
        <span style={mutedText}>
          版本 W/&quot;{version}&quot; · 更新于 {formatDateTime(content.updatedAt)}
        </span>
        <Button onClick={() => navigate('/contents')}>返回列表</Button>
        <Button
          busy={autosaveState.phase === 'saving'}
          disabled={!controller.hasUnsavedChanges()}
          onClick={() => void controller.flush()}
        >
          立即保存
        </Button>
      </div>

      {readOnly ? (
        <div style={dangerBanner}>
          当前状态不是草稿，服务端会拒绝直接编辑正文。如需修改，请先退回草稿。
        </div>
      ) : null}

      <AutosaveStatus
        state={autosaveState}
        busy={conflictBusy}
        onRetry={() => void controller.flush()}
      />

      <BasicsSection
        value={toBasics(draft)}
        onChange={(next) => markDirty({ ...draft, ...next })}
        typeLocked={readOnly}
        disabled={readOnly}
      />

      <BodySection
        value={draft.bodyText}
        onChange={(next) => markDirty({ ...draft, bodyText: next })}
        disabled={readOnly}
      />

      <TypeExtensionSection
        type={draft.type}
        values={draft.extensionValues}
        onChange={(next) => markDirty({ ...draft, extensionValues: next })}
        disabled={readOnly}
      />

      {/* 路线站点编排（FD-009）：只有 ROUTE 类型才有站点概念。 */}
      {draft.type === 'ROUTE' && content !== null ? (
        <RouteStopEditor key={`stops-${content.id}`} routeId={content.id} user={user} />
      ) : null}

      <SourcesSection
        links={links}
        newSource={newSource}
        attach={attach}
        onNewSourceChange={setNewSource}
        onAttachChange={setAttach}
        onCreate={createSource}
        onSearchSources={searchSources}
        onAttach={() =>
          void runSideTask(async () => {
            await libraryApi.attachSource(contentId, {
              sourceId: attach.sourceId.trim(),
              claimScope: attach.claimScope.trim(),
              pageReference:
                attach.pageReference.trim() === '' ? null : attach.pageReference.trim(),
              isPrimary: attach.isPrimary,
            });
            await refreshSideData(contentId);
          })
        }
        busy={sideBusy}
        error={sideError}
      />

      <RightsMediaSection
        intake={intake}
        complete={mediaForm}
        onIntakeChange={setIntake}
        onCompleteChange={setMediaForm}
        onCreateIntent={() =>
          void runSideTask(async () => {
            const created = await libraryApi.createUploadIntent({
              fileName: intake.fileName.trim(),
              mimeType: intake.mimeType.trim(),
              sizeBytes: Number(intake.sizeBytes),
            });
            setIntent(created);
          })
        }
        onCompleteUpload={() =>
          void runSideTask(async () => {
            if (intent === null) {
              throw new Error('请先申请上传意图');
            }
            const result = await libraryApi.completeMedia(intent.mediaId, {
              checksum: mediaForm.checksum.trim(),
              altText: mediaForm.altText.trim(),
              rightsStatus: mediaForm.rightsStatus,
              license: mediaForm.license.trim() === '' ? null : mediaForm.license.trim(),
              creditLine: mediaForm.creditLine.trim() === '' ? null : mediaForm.creditLine.trim(),
              creator: mediaForm.creator.trim() === '' ? null : mediaForm.creator.trim(),
              width: mediaForm.width.trim() === '' ? null : Number(mediaForm.width),
              height: mediaForm.height.trim() === '' ? null : Number(mediaForm.height),
            });
            setMediaResult(result);
          })
        }
        intent={intent}
        result={mediaResult}
        busy={sideBusy}
        error={sideError}
      />

      <TagsSection
        tags={tags}
        slug={tagForm.slug}
        displayName={tagForm.displayName}
        onChange={setTagForm}
        onSearchTags={() => void searchTags()}
        availableTags={availableTags}
        searchingTags={sideBusy}
        onAttach={() =>
          void runSideTask(async () => {
            await libraryApi.upsertTag({
              slug: tagForm.slug.trim(),
              displayName: tagForm.displayName.trim(),
            });
            await libraryApi.attachTag(contentId, tagForm.slug.trim());
            await refreshSideData(contentId);
          })
        }
        busy={sideBusy}
        error={sideError}
      />

      <RelationsSection
        relations={relations}
        targetContentId={relationForm.targetContentId}
        relationType={relationForm.relationType}
        directionNote={relationForm.directionNote}
        onChange={setRelationForm}
        onSearchTargets={() => void searchRelationTargets()}
        targets={relationTargets}
        searchingTargets={sideBusy}
        onCreate={() =>
          void runSideTask(async () => {
            await libraryApi.createRelation(contentId, {
              targetContentId: relationForm.targetContentId.trim(),
              relationType: relationForm.relationType,
              directionNote:
                relationForm.directionNote.trim() === '' ? null : relationForm.directionNote.trim(),
            });
            await refreshSideData(contentId);
          })
        }
        busy={sideBusy}
        error={sideError}
      />

      <SeoSection
        slug={draft.slug}
        title={draft.title}
        summary={draft.summary}
        onSummaryChange={(next) => markDirty({ ...draft, summary: next })}
      />

      <ReviewPanel
        content={content}
        user={user}
        readiness={readiness}
        readinessState={readinessState}
        busyAction={busyAction}
        errorMessage={actionError}
        onCheckReadiness={() => void checkReadiness()}
        onTransition={(action, reason) => void runTransition(action, reason)}
        history={{
          revisions,
          reviewActions,
          state: historyState,
          errorMessage: historyError.message,
          requestId: historyError.requestId,
          loadingMore: historyLoadingMore,
          onLoadMore: () => {
            // 哪一侧还有下一页就先翻哪一侧；两侧都由各自按钮触发。
            if (nextRevisionCursor !== null) {
              void loadMoreHistory('revisions');
            } else if (nextReviewCursor !== null) {
              void loadMoreHistory('reviewActions');
            }
          },
          onRetry: () => void loadHistory(contentId),
        }}
      />

      <ConflictDialog
        open={conflict !== null}
        info={conflict ?? { localVersion: version, serverVersion: null, serverUpdatedAt: null }}
        local={localForDiff}
        server={conflictServer ?? toDiffSource(toDraft(content))}
        onReloadServer={() => void reloadFromServer()}
        onOverwrite={() => void overwriteServer()}
        onClose={() => setConflict(null)}
      />
    </div>
  );
}

/**
 * 新建草稿：类型 + slug + 标题 + 语言 + 最小正文。
 * 真正的八区编辑在创建成功后进入 `/contents/:id`。
 */
function NewContentForm({
  onUnauthorized,
  onCreated,
}: {
  onUnauthorized: () => void;
  onCreated: (content: AdminContentDto) => void;
}) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState<ContentType>('PLACE');
  const [language, setLanguage] = useState<Language>('ZH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const extension = buildExtension(type, {});
      if (extension === null) {
        setError('民俗传统类型必须填写「传统类型」');
        return;
      }
      const created = await contentApi.create({
        type,
        slug: slug.trim(),
        title: title.trim(),
        body: JSON.parse(EMPTY_DOC) as unknown,
        language,
        extension,
      });
      onCreated(created);
    } catch (cause) {
      if (isApiAuthError(cause)) {
        onUnauthorized();
        return;
      }
      setError(describeError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, ...stack, maxWidth: '40rem' }}>
      <h1 style={{ fontSize: '1.2rem', margin: 0 }}>新建草稿</h1>
      <p style={mutedText}>先确定类型、slug 与标题即可建稿；创建后进入编辑器补来源、版权与正文。</p>
      <label style={stack} htmlFor="new-title">
        <span style={{ fontWeight: 600 }}>标题 *</span>
        <input
          id="new-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={stack} htmlFor="new-slug">
        <span style={{ fontWeight: 600 }}>Slug *</span>
        <input
          id="new-slug"
          value={slug}
          placeholder="qinhuai-river-night-market"
          onChange={(event) => setSlug(event.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={row} htmlFor="new-type">
        类型 *
        <select
          id="new-type"
          value={type}
          onChange={(event) => setType(event.target.value as ContentType)}
          style={{ ...inputStyle, width: 'auto' }}
        >
          <option value="PLACE">地点</option>
          <option value="PERSON">人物</option>
          <option value="EVENT">事件</option>
          <option value="ARCHITECTURE">建筑</option>
          <option value="TRADITION">民俗传统</option>
          <option value="TOPIC">专题</option>
          <option value="ROUTE">路线</option>
        </select>
      </label>
      <label style={row} htmlFor="new-language">
        语言
        <select
          id="new-language"
          value={language}
          onChange={(event) => setLanguage(event.target.value as Language)}
          style={{ ...inputStyle, width: 'auto' }}
        >
          <option value="ZH">中文</option>
          <option value="EN">English</option>
        </select>
      </label>
      {error === null ? null : (
        <p role="alert" style={dangerBanner}>
          {error}
        </p>
      )}
      <div style={row}>
        <Button
          variant="primary"
          busy={busy}
          disabled={title.trim() === '' || slug.trim() === ''}
          onClick={() => void submit()}
        >
          创建草稿
        </Button>
        <Button onClick={() => navigate('/contents')}>取消</Button>
      </div>
    </div>
  );
}
