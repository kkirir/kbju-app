window.STATE =
{
  "slug": "kbju-photo-tracker",
  "title": "КБЖУ по фото еды и этикетки",
  "mode": "semi",
  "depth": "normal",
  "tier": "T2",
  "briefFile": "2026-10-16-brief.md",
  "memoryFile": "CLAUDE.md",
  "startedAt": "2026-10-16T15:54:07+02:00",
  "updatedAt": "2026-10-16T18:15:00+02:00",
  "finishedAt": "2026-10-16T18:15:00+02:00",
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-10-16T15:54:07+02:00",
      "finishedAt": "2026-10-16T15:56:00+02:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-10-16T15:56:00+02:00",
      "finishedAt": "2026-10-16T15:56:00+02:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-10-16T15:56:00+02:00",
      "finishedAt": "2026-10-16T16:02:00+02:00",
      "note": "3 вопроса"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-10-16T16:02:00+02:00",
      "finishedAt": "2026-10-16T16:12:00+02:00"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-10-16T16:12:00+02:00",
      "finishedAt": "2026-10-16T16:20:00+02:00",
      "note": "3 таска, 2 волны, ярус T2"
    },
    {
      "id": "build",
      "status": "done",
      "startedAt": "2026-10-16T16:20:00+02:00",
      "note": "3 из 3 тасков готовы",
      "finishedAt": "2026-10-16T17:55:00+02:00"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-10-16T16:41:00+02:00",
      "note": "проверено 3 из 3",
      "finishedAt": "2026-10-16T17:55:00+02:00"
    },
    {
      "id": "final",
      "status": "done",
      "startedAt": "2026-10-16T17:55:00+02:00",
      "finishedAt": "2026-10-16T18:15:00+02:00"
    }
  ],
  "requirements": {
    "total": 15,
    "done": 15,
    "inTicket": 0,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Каркас, дневник, норма, настройки",
      "requirements": [
        "R01",
        "R02",
        "R06",
        "R09",
        "R10i",
        "R11i",
        "R12i",
        "R13i",
        "R14i",
        "R15i",
        "A01",
        "A02"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "index.html",
        "src/ui/",
        "src/nutrition.js",
        "src/store.js"
      ],
      "status": "done",
      "startedAt": "2026-10-16T16:20:00+02:00",
      "retries": 0,
      "repairs": 1,
      "finishedAt": "2026-10-16T17:20:00+02:00",
      "tests": {
        "passed": 14,
        "failed": 0
      },
      "commit": "bbaec1d",
      "concerns": [
        "store импортирует DEFAULT_MODEL из ai.js"
      ]
    },
    {
      "id": "02",
      "title": "Распознавание: Claude, Open Food Facts, фото",
      "requirements": [
        "R03",
        "R04",
        "R05",
        "R07",
        "R08",
        "R14i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "src/ai.js",
        "src/foodfacts.js",
        "src/image.js"
      ],
      "status": "done",
      "startedAt": "2026-10-16T16:20:00+02:00",
      "retries": 0,
      "repairs": 1,
      "finishedAt": "2026-10-16T16:58:00+02:00",
      "tests": {
        "passed": 22,
        "failed": 0
      },
      "commit": "6a7931b",
      "files": [
        "src/ai.js",
        "src/foodfacts.js",
        "src/image.js"
      ],
      "concerns": [
        "parseNumber живёт в foodfacts.js, ai.js его импортирует",
        "image.js проверяется вручную в Safari"
      ]
    },
    {
      "id": "03",
      "title": "Экраны съёмки: еда, этикетка, штрих-код",
      "requirements": [
        "R03",
        "R04",
        "R05",
        "R07",
        "R08",
        "R13i",
        "R14i"
      ],
      "blockedBy": [
        "01",
        "02"
      ],
      "wave": 2,
      "zone": [
        "src/ui/capture.js"
      ],
      "status": "done",
      "retries": 0,
      "repairs": 1,
      "startedAt": "2026-10-16T17:20:00+02:00",
      "finishedAt": "2026-10-16T17:55:00+02:00",
      "tests": {
        "passed": 36,
        "failed": 0
      },
      "commit": "afa57d6",
      "concerns": [
        "экран «нет ключа» появляется после съёмки, а не до",
        "этикетки без названия в «Недавних» перезаписывают друг друга"
      ]
    }
  ],
  "singlePass": null,
  "tests": {
    "passed": 36,
    "failed": 0
  },
  "debt": {
    "placeholders": [
      "Ключ Claude API — вставляется в Настройках приложения"
    ],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [
    "A01 Недавние продукты — ради R09",
    "A02 Экспорт/импорт — ради R10i"
  ],
  "coverage": {
    "found": 4,
    "fixed": 3,
    "deferred": 1,
    "note": "Yazio целиком — в Вне рамок; порции без массы, «Недавние», критерий Yazio — дописаны"
  },
  "blind": {
    "agreed": 13,
    "partial": [
      "R06 — остальное из Yazio вне рамок (ожидаемо)",
      "R08 — штрих-код по фото, не живой сканер"
    ],
    "drift": [],
    "note": "настоящий ИИ не проверялся — нет ключа"
  }
}
