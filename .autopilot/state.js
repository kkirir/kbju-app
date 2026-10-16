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
  "updatedAt": "2026-10-16T16:50:00+02:00",
  "finishedAt": null,
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
      "status": "active",
      "startedAt": "2026-10-16T16:20:00+02:00",
      "note": "0 из 3 тасков готовы"
    },
    {
      "id": "review",
      "status": "active",
      "startedAt": "2026-10-16T16:41:00+02:00",
      "note": "проверяется таск 02"
    },
    {
      "id": "final",
      "status": "pending"
    }
  ],
  "requirements": {
    "total": 15,
    "done": 0,
    "inTicket": 15,
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
      "status": "in-progress",
      "startedAt": "2026-10-16T16:20:00+02:00",
      "retries": 0,
      "repairs": 0
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
      "status": "repair",
      "startedAt": "2026-10-16T16:20:00+02:00",
      "retries": 0,
      "repairs": 1
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
      "status": "pending",
      "retries": 0,
      "repairs": 0
    }
  ],
  "singlePass": null,
  "tests": null,
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
  "blind": null
}
