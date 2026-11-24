// Клиент-безопасный конфиг: здесь НЕТ секретов, файл импортируется и в браузере.

export type Mode = "chat" | "compress" | "vision";

export const MODE_ORDER: Mode[] = ["chat", "compress", "vision"];

export const MODES: Record<
  Mode,
  { label: string; hint: string; placeholder: string; category: string; defaultImagePrompt?: string }
> = {
  chat: {
    label: "Чат / Решение",
    hint: "Вопросы и пошаговый разбор задач",
    placeholder: "Задай вопрос или вставь задачу…",
    category: "Задачи и разборы",
  },
  compress: {
    label: "Сжатие / Расшифровка",
    hint: "Выжимка и структура из длинного текста",
    placeholder: "Вставь длинный текст или запутанную запись…",
    category: "Сжатие и расшифровка",
  },
  vision: {
    label: "Анализ по картинке",
    hint: "Разбор фото, скриншота, текст с изображения",
    placeholder: "Прикрепи фото и задай вопрос (необязательно)…",
    category: "Анализ фото",
    defaultImagePrompt: "Разбери это изображение: выпиши текст, если он есть, и поясни, что на нём.",
  },
};

export type Category = "all" | Mode;

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "Все чаты" },
  { id: "chat", label: MODES.chat.category },
  { id: "compress", label: MODES.compress.category },
  { id: "vision", label: MODES.vision.category },
];

export const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "Короче", prompt: "Сделай свой предыдущий ответ короче, оставь только главное." },
  { label: "Проще", prompt: "Объясни проще, как для новичка, без сложных терминов." },
  { label: "Подробнее", prompt: "Разверни ответ подробнее, с примером." },
];

export const KEY_LABELS = ["Ключ 1", "Ключ 2", "Запасной"] as const;
