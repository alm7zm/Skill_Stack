/**
 * Languages a certification exam can be sat in. These canonical English names
 * are what gets stored in user_languages and compared against
 * certifications.languages — so exam-language matching works no matter which
 * interface language the user picked them in. Display labels are localized in
 * the dictionaries (dict.languageNames); the stored value is always the name
 * below. Shared by the profile form and the action that validates it, so the
 * dropdown can only ever produce a value the catalog can match.
 */
export const EXAM_LANGUAGES = [
  'English', 'Arabic', 'French', 'German', 'Spanish', 'Portuguese', 'Italian',
  'Japanese', 'Korean', 'Chinese', 'Russian', 'Hindi', 'Turkish', 'Dutch',
] as const;

export type ExamLanguage = (typeof EXAM_LANGUAGES)[number];
