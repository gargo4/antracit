// Клиент-безопасный конфиг: здесь НЕТ секретов, файл импортируется и в браузере.

export type Mode = "chat" | "learn" | "compress" | "vision";
export type Level = "school" | "student";

export const MODE_ORDER: Mode[] = ["chat", "learn", "compress", "vision"];

export const MODES: Record<
  Mode,
  { label: string; short: string; hint: string; placeholder: string; category: string; defaultImagePrompt?: string }
> = {
  chat: {
    label: "Решить задачу",
    short: "Решить",
    hint: "Спроси что угодно или кинь задачу — разберу по шагам",
    placeholder: "Вопрос или задача…",
    category: "Задачи и вопросы",
  },
  learn: {
    label: "Учиться",
    short: "Учиться",
    hint: "Выбери тему — научу по шагам, как репетитор, и проверю, понял ли ты",
    placeholder: "Какую тему выучить?",
    category: "Уроки",
    defaultImagePrompt: "Научи меня этой теме по шагам.",
  },
  compress: {
    label: "Сжать текст",
    short: "Сжать",
    hint: "Сфоткай страницы книги или вставь текст — перескажу коротко и понятно",
    placeholder: "Текст или фото страниц…",
    category: "Пересказы",
    defaultImagePrompt: "Перескажи коротко, о чём тут.",
  },
  vision: {
    label: "Разобрать фото",
    short: "Фото",
    hint: "Сфоткай задачу, страницу или экран — разберу, что там",
    placeholder: "Фото — кнопка слева 👈",
    category: "Фото",
    defaultImagePrompt: "Разбери это фото.",
  },
};

export const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "school", label: "Просто", hint: "как для школьника" },
  { id: "student", label: "Подробно", hint: "как для студента" },
];

export type Category = "all" | Mode;

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "Все чаты" },
  { id: "chat", label: MODES.chat.category },
  { id: "learn", label: MODES.learn.category },
  { id: "compress", label: MODES.compress.category },
  { id: "vision", label: MODES.vision.category },
];

/** Запасные кнопки — если модель не предложила свои. */
export const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  { label: "Короче", prompt: "Короче" },
  { label: "Ещё проще", prompt: "Объясни ещё проще" },
  { label: "Пример", prompt: "Покажи на примере" },
];

/** Кнопка, которая не пишет в чат, а открывает выбор фото. */
export const PHOTO_ACTION_PREFIX = "📷";

/** Сколько фото можно прикрепить к одному сообщению (например, несколько страниц главы). */
export const MAX_IMAGES = 4;

/** Вкладки, где можно прикреплять фото. В «Решить» фото переключает на «Фото». */
export const PHOTO_MODES: Mode[] = ["learn", "compress", "vision"];

export const KEY_LABELS = ["Ключ 1", "Ключ 2", "Запасной"] as const;

/** Темы-подсказки на главном экране вкладки «Учиться» (по уровню). */
export const LEARN_TOPICS: Record<Level, string[]> = {
  school: ["Дроби", "Проценты", "Уравнения", "Таблица умножения", "Части речи", "Present Simple"],
  student: ["Производная", "Логарифмы", "Интегралы", "Вероятность", "Пределы", "Матрицы"],
};
