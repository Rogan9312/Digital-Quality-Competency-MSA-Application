/* =============================================================
   Hodnotenie defektov — schéma pre Microsoft SQL Server
   =============================================================
   Relačný náprotivok aktuálneho Firestore dátového modelu appky
   (pozri PROJECT-SUMMARY.md → "Dátový model (Firestore kolekcie)").
   Firestore je NoSQL dokumentová databáza bez schémy a bez cudzích
   kľúčov — tento skript ten istý dátový model prevádza na relačné
   tabuľky s typmi, cudzími kľúčmi a indexmi. Dve miesta sú zámerne
   normalizované (nie 1:1 kópia tvaru dokumentu), aby výsledok bol
   použiteľný ako SQL databáza, nie len JSON uložený v stĺpci:
     1. `attempts.answers` (pole objektov vnorené v dokumente) sa tu
        stáva samostatnou tabuľkou `dbo.attempt_answers` (1 riadok =
        1 vyhodnotená fotka v danom pokuse), s cudzím kľúčom na
        `attempts.id`.
     2. `kv` (všeobecné key-value úložisko appky — v praxi len 3
        kľúče: `activeBatchId`, `adminPin`, `hiddenOperatorNames`) sa
        rozpadá na typovanú tabuľku `dbo.app_settings` (nastavenia,
        jeden riadok) a tabuľku `dbo.hidden_operator_names`
        (zoznam skrytých mien, jeden riadok na meno).
   Všetko ostatné (areas, batches, photos, operators, qualityAlerts,
   qualityAlertAcks) má priamy 1:1 náprotivok tabuľky.

   DÔLEŽITÉ — toto je LEN schéma databázy (DDL), nie kompletná migrácia
   appky. Appka dnes volá Firestore priamo z prehliadača cez Firebase
   JS SDK (žiadny vlastný backend) — na SQL Server takto z prehliadača
   pripojiť nejde (nemá klientsky JS SDK ako Firestore). Aby appka
   reálne fungovala nad touto databázou, treba navyše:
     - Backend/API vrstvu (napr. Node.js + balík `mssql`, alebo .NET
       minimal API) medzi appkou a SQL Serverom — appka by volala túto
       API (fetch/HTTP) namiesto `firestore.collection(...)`.
     - Prepísať dátovú vrstvu appky (`idbPut/idbGet/idbGetAll/
       idbDeleteKey/idbClear` v hodnotenie-defektov.html) tak, aby
       namiesto Firestore volala túto novú API.
     - Riešenie prihlásenia — Firebase Authentication dnes stráži celú
       appku; SQL Server žiadne prihlasovanie pre web appky nerieši,
       treba samostatné riešenie (napr. ponechať Firebase Auth len na
       login a presunúť len DÁTA, alebo postaviť vlastné).
     - Nové hosting miesto pre backend (GitHub Pages, kde appka dnes
       beží, servuje len statické súbory, nevie spustiť server).
   Tento skript je prvý krok (schéma) — zvyšok je samostatná, oveľa
   väčšia úloha, ak sa do nej pôjde.
   ============================================================= */

-- Vytvorenie databázy (vynechaj/uprav, ak sa skript spúšťa nad už
-- existujúcou databázou — napr. na Azure SQL databázu vytvára portál/CLI).
IF DB_ID(N'HodnotenieDefektov') IS NULL
BEGIN
    CREATE DATABASE [HodnotenieDefektov];
END
GO

USE [HodnotenieDefektov];
GO

/* =============================================================
   areas — Sekcie/projekty (nadradená kategória nad dávkami)
   Firestore: areas (doc id = id) — {id, label, createdAt}
   ============================================================= */
IF OBJECT_ID(N'dbo.areas', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.areas (
        id          NVARCHAR(64)    NOT NULL CONSTRAINT PK_areas PRIMARY KEY,
        label       NVARCHAR(200)   NOT NULL,
        created_at  DATETIME2(3)    NOT NULL CONSTRAINT DF_areas_created_at DEFAULT SYSUTCDATETIME()
    );
END
GO

/* =============================================================
   batches — Dávky (jedna sada fotiek + správnych odpovedí)
   Firestore: batches (doc id = id) — {id, label, createdAt, areaId}
   ============================================================= */
IF OBJECT_ID(N'dbo.batches', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.batches (
        id          NVARCHAR(64)    NOT NULL CONSTRAINT PK_batches PRIMARY KEY,
        label       NVARCHAR(200)   NOT NULL,
        area_id     NVARCHAR(64)    NULL,
        created_at  DATETIME2(3)    NOT NULL CONSTRAINT DF_batches_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_batches_area FOREIGN KEY (area_id) REFERENCES dbo.areas(id) ON DELETE SET NULL
    );
    CREATE INDEX IX_batches_area_id ON dbo.batches(area_id);
END
GO

/* =============================================================
   photos — fotky defektov v dávke, vrátane samotného obrázka ako
   base64 data: URL (appka zámerne nepoužíva Firebase Storage —
   pozri PROJECT-SUMMARY.md). NVARCHAR(MAX) nemá v SQL Serveri
   obdobu Firestore limitu 1 MiB na dokument.
   Firestore: photos (doc id = id) —
   {id, name, photoData, correctAnswer, order, batchId}
   ============================================================= */
IF OBJECT_ID(N'dbo.photos', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.photos (
        id              NVARCHAR(64)    NOT NULL CONSTRAINT PK_photos PRIMARY KEY,
        batch_id        NVARCHAR(64)    NOT NULL,
        name            NVARCHAR(400)   NULL,
        photo_data      NVARCHAR(MAX)   NOT NULL,   -- base64 "data:image/jpeg;base64,..." reťazec
        correct_answer  NVARCHAR(16)    NULL,        -- NULL kým admin nedefinuje; OK / HRANICNE / NOK
        [order]         INT             NOT NULL CONSTRAINT DF_photos_order DEFAULT 0,
        CONSTRAINT FK_photos_batch FOREIGN KEY (batch_id) REFERENCES dbo.batches(id) ON DELETE CASCADE,
        CONSTRAINT CK_photos_correct_answer CHECK (correct_answer IS NULL OR correct_answer IN (N'OK', N'HRANICNE', N'NOK'))
    );
    CREATE INDEX IX_photos_batch_id ON dbo.photos(batch_id);
END
GO

/* =============================================================
   operators — RFID/NFC karta → meno operátora
   Firestore: operators (doc id = id) — {id, badgeId, name, createdAt}
   ============================================================= */
IF OBJECT_ID(N'dbo.operators', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.operators (
        id          NVARCHAR(64)    NOT NULL CONSTRAINT PK_operators PRIMARY KEY,
        name        NVARCHAR(200)   NOT NULL,
        badge_id    NVARCHAR(100)   NOT NULL,
        created_at  DATETIME2(3)    NOT NULL CONSTRAINT DF_operators_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_operators_badge_id UNIQUE (badge_id)
    );
END
GO

/* =============================================================
   attempts — jeden dokončený test jedného operátora.
   `batch_label` a `attempt_answers.correct_at_time` sú zámerne
   SNAPSHOTY (nie live JOIN na batches/photos) — presne ako vo
   Firestore verzii — aby neskoršie premenovanie dávky alebo zmena
   správnej odpovede nepokazili historické reporty.
   `operator_name` je obyčajný text, NIE cudzí kľúč na operators —
   appka explicitne povoľuje aj ručne napísané mená bez karty.
   Firestore: attempts (doc id = auto-gen string) —
   {id, batchId, batchLabel, operatorName, startedAt, finishedAt,
    totalCount, correctCount, scorePercent, detectionMatchCount,
    detectionScorePercent, archived, answers:[...]}
   ============================================================= */
IF OBJECT_ID(N'dbo.attempts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.attempts (
        id                          NVARCHAR(64)    NOT NULL CONSTRAINT PK_attempts PRIMARY KEY,
        batch_id                    NVARCHAR(64)    NOT NULL,
        batch_label                 NVARCHAR(200)   NOT NULL,   -- snapshot
        operator_name               NVARCHAR(200)   NOT NULL,
        started_at                  DATETIME2(3)    NOT NULL,
        finished_at                 DATETIME2(3)    NOT NULL,
        total_count                 INT             NOT NULL,
        correct_count               INT             NOT NULL,
        score_percent               INT             NOT NULL,
        detection_match_count       INT             NOT NULL CONSTRAINT DF_attempts_det_match DEFAULT 0,
        detection_score_percent     INT             NOT NULL CONSTRAINT DF_attempts_det_pct DEFAULT 0,
        archived                    BIT             NOT NULL CONSTRAINT DF_attempts_archived DEFAULT 0,
        -- ON DELETE CASCADE zámerne — appka pri mazaní dávky ("Vymazať
        -- túto dávku") explicitne maže aj "všetky jej výsledky" (pozri
        -- potvrdzovací dialóg v kóde), takže toto len zrkadlí skutočné
        -- správanie appky na úrovni DB.
        CONSTRAINT FK_attempts_batch FOREIGN KEY (batch_id) REFERENCES dbo.batches(id) ON DELETE CASCADE
    );
    CREATE INDEX IX_attempts_batch_id ON dbo.attempts(batch_id);
    CREATE INDEX IX_attempts_operator_name ON dbo.attempts(operator_name);
    CREATE INDEX IX_attempts_finished_at ON dbo.attempts(finished_at);
    CREATE INDEX IX_attempts_archived ON dbo.attempts(archived);
END
GO

/* =============================================================
   attempt_answers — normalizácia vnoreného poľa `attempts.answers`
   z Firestore (1 riadok = 1 vyhodnotená fotka v danom pokuse).
   `photo_id` je zámerne BEZ cudzieho kľúča na photos — ide o
   historický snapshot (photo_name + correct_at_time sú tiež
   skopírované v čase testu), takže musí prežiť aj vymazanie
   pôvodnej fotky/dávky. `answer_order` zachováva pôvodné poradie
   poľa (SQL tabuľka nemá implicitné poradie riadkov).
   `is_correct`/`is_exact_match` sú (rovnako ako vo Firestore verzii)
   REDUNDANTNÉ polia zapísané pri vytvorení pokusu — appka sama ich
   pri čítaní ignoruje a prepočítava naživo z given/correct_at_time
   (pozri PROJECT-SUMMARY.md, "Vyhodnotenie sa počíta VŽDY naživo").
   Ak by sa appka migrovala, odporúčam toto pravidlo zachovať aj v
   novej (SQL) verzii dátovej vrstvy, nie spoliehať sa na tieto
   stĺpce.
   ============================================================= */
IF OBJECT_ID(N'dbo.attempt_answers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.attempt_answers (
        attempt_answer_id  INT             NOT NULL IDENTITY(1,1) CONSTRAINT PK_attempt_answers PRIMARY KEY,
        attempt_id         NVARCHAR(64)    NOT NULL,
        photo_id           NVARCHAR(64)    NOT NULL,
        photo_name         NVARCHAR(400)   NULL,          -- snapshot názvu súboru fotky
        given              NVARCHAR(16)    NOT NULL,       -- odpoveď operátora: OK / HRANICNE / NOK
        correct_at_time    NVARCHAR(16)    NOT NULL,       -- snapshot správnej odpovede v čase testu
        note               NVARCHAR(1000)  NULL,
        is_correct         BIT             NOT NULL,       -- redundantné, pozri komentár vyššie
        is_exact_match     BIT             NOT NULL,       -- redundantné, pozri komentár vyššie
        answer_order        INT             NOT NULL,
        CONSTRAINT FK_attempt_answers_attempt FOREIGN KEY (attempt_id) REFERENCES dbo.attempts(id) ON DELETE CASCADE,
        CONSTRAINT CK_attempt_answers_given CHECK (given IN (N'OK', N'HRANICNE', N'NOK')),
        CONSTRAINT CK_attempt_answers_correct_at_time CHECK (correct_at_time IN (N'OK', N'HRANICNE', N'NOK'))
    );
    CREATE INDEX IX_attempt_answers_attempt_id ON dbo.attempt_answers(attempt_id);
    CREATE INDEX IX_attempt_answers_photo_id ON dbo.attempt_answers(photo_id);
END
GO

/* =============================================================
   quality_alerts — upozornenia viazané na Sekciu (area)
   Firestore: qualityAlerts (doc id = id) —
   {id, areaId, title, description, imageData, dateFrom,
    durationDays, isActive, createdAt}
   `dateTo` sa (rovnako ako vo Firestore appke) nikde needukladá,
   len dopočítava z date_from + duration_days.
   ============================================================= */
IF OBJECT_ID(N'dbo.quality_alerts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.quality_alerts (
        id              NVARCHAR(64)    NOT NULL CONSTRAINT PK_quality_alerts PRIMARY KEY,
        area_id         NVARCHAR(64)    NULL,
        title           NVARCHAR(300)   NOT NULL,
        description     NVARCHAR(MAX)   NULL,
        image_data      NVARCHAR(MAX)   NULL,   -- nepovinná fotka, base64 data: URL
        date_from       DATE            NOT NULL,
        duration_days   INT             NOT NULL,
        is_active       BIT             NOT NULL CONSTRAINT DF_quality_alerts_active DEFAULT 1,
        created_at      DATETIME2(3)    NOT NULL CONSTRAINT DF_quality_alerts_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_quality_alerts_area FOREIGN KEY (area_id) REFERENCES dbo.areas(id) ON DELETE SET NULL
    );
    CREATE INDEX IX_quality_alerts_area_id ON dbo.quality_alerts(area_id);
END
GO

/* =============================================================
   quality_alert_acks — kto videl/potvrdil ktorý Quality Alert.
   Samostatná tabuľka (nie pole v quality_alerts), aby zápisy od
   viacerých operátorov naraz nekolidovali — rovnaký dôvod ako vo
   Firestore verzii. `operator_name` je text, nie cudzí kľúč
   (rovnaká logika ako attempts.operator_name).
   Firestore: qualityAlertAcks (doc id = id) —
   {id, qualityAlertId, operatorName, ackedAt}
   ============================================================= */
IF OBJECT_ID(N'dbo.quality_alert_acks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.quality_alert_acks (
        id                  NVARCHAR(64)    NOT NULL CONSTRAINT PK_quality_alert_acks PRIMARY KEY,
        quality_alert_id    NVARCHAR(64)    NOT NULL,
        operator_name       NVARCHAR(200)   NOT NULL,
        acked_at            DATETIME2(3)    NOT NULL CONSTRAINT DF_quality_alert_acks_acked_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_quality_alert_acks_alert FOREIGN KEY (quality_alert_id) REFERENCES dbo.quality_alerts(id) ON DELETE CASCADE
    );
    CREATE INDEX IX_quality_alert_acks_alert_id ON dbo.quality_alert_acks(quality_alert_id);
    CREATE INDEX IX_quality_alert_acks_operator_name ON dbo.quality_alert_acks(operator_name);
END
GO

/* =============================================================
   app_settings — náhrada za Firestore `kv` kolekciu (okrem
   hiddenOperatorNames, tá má vlastnú tabuľku nižšie, keďže ide
   prirodzene o zoznam, nie jednu hodnotu). Jeden riadok (id=1).
   Firestore: kv.activeBatchId {key, value}, kv.adminPin {key, hash, salt}
   ============================================================= */
IF OBJECT_ID(N'dbo.app_settings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.app_settings (
        id                  INT             NOT NULL CONSTRAINT PK_app_settings PRIMARY KEY,
        active_batch_id     NVARCHAR(64)    NULL,
        admin_pin_hash      NVARCHAR(200)   NULL,   -- SHA-256 hash 4-miestneho PIN kódu
        admin_pin_salt      NVARCHAR(200)   NULL,
        CONSTRAINT CK_app_settings_singleton CHECK (id = 1),
        CONSTRAINT FK_app_settings_active_batch FOREIGN KEY (active_batch_id) REFERENCES dbo.batches(id) ON DELETE SET NULL
    );
    -- jediný riadok nastavení, appka ho pri inicializácii UPDATE-uje (nikdy INSERT ďalší)
    INSERT INTO dbo.app_settings (id, active_batch_id, admin_pin_hash, admin_pin_salt)
    VALUES (1, NULL, NULL, NULL);
END
GO

/* =============================================================
   hidden_operator_names — mená operátorov (napr. testovacie účty
   "TST", "TST1"), ktoré sa nemajú počítať do Reportov ani Dashboardu.
   Firestore: kv.hiddenOperatorNames {key, names: [...]} — tu rozpadnuté
   na jeden riadok na meno namiesto JSON poľa v jednom stĺpci.
   ============================================================= */
IF OBJECT_ID(N'dbo.hidden_operator_names', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.hidden_operator_names (
        operator_name   NVARCHAR(200)   NOT NULL CONSTRAINT PK_hidden_operator_names PRIMARY KEY,
        hidden_at       DATETIME2(3)    NOT NULL CONSTRAINT DF_hidden_operator_names_hidden_at DEFAULT SYSUTCDATETIME()
    );
END
GO
