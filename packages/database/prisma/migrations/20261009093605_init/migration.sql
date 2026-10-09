-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "disabled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "granted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" TEXT,

    PRIMARY KEY ("user_id", "role"),
    CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "revoked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "summary" TEXT,
    "body_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "language" TEXT NOT NULL DEFAULT 'ZH',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "published_at" DATETIME,
    "archived_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "contents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "places" (
    "content_id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT,
    "lon" REAL,
    "lat" REAL,
    "accuracy" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "verification_status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    CONSTRAINT "places_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "people" (
    "content_id" TEXT NOT NULL PRIMARY KEY,
    "birth_text" TEXT,
    "death_text" TEXT,
    "biography_note" TEXT,
    CONSTRAINT "people_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "events" (
    "content_id" TEXT NOT NULL PRIMARY KEY,
    "start_date" DATETIME,
    "end_date" DATETIME,
    "date_precision" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "date_note" TEXT,
    CONSTRAINT "events_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "architectures" (
    "content_id" TEXT NOT NULL PRIMARY KEY,
    "built_period" TEXT,
    "current_condition" TEXT,
    "heritage_level" TEXT,
    CONSTRAINT "architectures_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "traditions" (
    "content_id" TEXT NOT NULL PRIMARY KEY,
    "tradition_type" TEXT NOT NULL,
    "transmission_method" TEXT,
    CONSTRAINT "traditions_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "topics" (
    "content_id" TEXT NOT NULL PRIMARY KEY,
    "curator_note" TEXT,
    CONSTRAINT "topics_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "routes" (
    "content_id" TEXT NOT NULL PRIMARY KEY,
    "duration_minutes" INTEGER,
    "distance_meters" INTEGER,
    CONSTRAINT "routes_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "route_stops" (
    "route_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "place_id" TEXT NOT NULL,
    "note" TEXT,

    PRIMARY KEY ("route_id", "position"),
    CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes" ("content_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "route_stops_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "contents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_relations" (
    "source_content_id" TEXT NOT NULL,
    "target_content_id" TEXT NOT NULL,
    "relation_type" TEXT NOT NULL,
    "direction_note" TEXT,

    PRIMARY KEY ("source_content_id", "target_content_id", "relation_type"),
    CONSTRAINT "content_relations_source_content_id_fkey" FOREIGN KEY ("source_content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_relations_target_content_id_fkey" FOREIGN KEY ("target_content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publisher" TEXT,
    "publication_date" DATETIME,
    "url" TEXT,
    "accessed_at" DATETIME,
    "citation_text" TEXT,
    "verification_note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "content_sources" (
    "content_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "claim_scope" TEXT NOT NULL,
    "page_reference" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("content_id", "source_id", "claim_scope"),
    CONSTRAINT "content_sources_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "object_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT NOT NULL,
    "creator" TEXT,
    "rights_status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "license" TEXT,
    "credit_line" TEXT,
    "alt_text" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_media" (
    "content_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "usage" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,

    PRIMARY KEY ("content_id", "media_id", "usage"),
    CONSTRAINT "content_media_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tags" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "display_name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "content_tags" (
    "content_id" TEXT NOT NULL,
    "tag_slug" TEXT NOT NULL,

    PRIMARY KEY ("content_id", "tag_slug"),
    CONSTRAINT "content_tags_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_tags_tag_slug_fkey" FOREIGN KEY ("tag_slug") REFERENCES "tags" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "upload_intents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "media_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "upload_url" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "upload_intents_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "upload_intents_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "revisions" (
    "content_id" TEXT NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "snapshot_json" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("content_id", "revision_no"),
    CONSTRAINT "revisions_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "review_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "comment" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_actions_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor_id" TEXT,
    "request_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_json" TEXT,
    "after_json" TEXT,
    "ip_hash" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "contents_slug_key" ON "contents"("slug");

-- CreateIndex
CREATE INDEX "contents_type_status_idx" ON "contents"("type", "status");

-- CreateIndex
CREATE INDEX "contents_status_published_at_idx" ON "contents"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "contents_slug_idx" ON "contents"("slug");

-- CreateIndex
CREATE INDEX "route_stops_place_id_idx" ON "route_stops"("place_id");

-- CreateIndex
CREATE INDEX "content_relations_target_content_id_idx" ON "content_relations"("target_content_id");

-- CreateIndex
CREATE INDEX "content_sources_source_id_idx" ON "content_sources"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_object_key_key" ON "media"("object_key");

-- CreateIndex
CREATE INDEX "content_media_media_id_idx" ON "content_media"("media_id");

-- CreateIndex
CREATE INDEX "content_tags_tag_slug_idx" ON "content_tags"("tag_slug");

-- CreateIndex
CREATE UNIQUE INDEX "upload_intents_media_id_key" ON "upload_intents"("media_id");

-- CreateIndex
CREATE INDEX "revisions_content_id_created_at_idx" ON "revisions"("content_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "review_actions_content_id_created_at_idx" ON "review_actions"("content_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);
