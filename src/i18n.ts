import i18n from 'i18next';

import en from './locales/en/translation.json';
import de from './locales/de/translation.json';
import es from './locales/es/translation.json';
import fr from './locales/fr/translation.json';
import it from './locales/it/translation.json';
import ja from './locales/ja/translation.json';
import zhCN from './locales/zh-CN/translation.json';
import ru from './locales/ru/translation.json';
import ko from './locales/ko/translation.json';
import ptBR from './locales/pt-BR/translation.json';
import pl from './locales/pl/translation.json';
import tr from './locales/tr/translation.json';
import zhTW from './locales/zh-TW/translation.json';

i18n.init({
    resources: {
        en:    { translation: en },
        de:    { translation: de },
        es:    { translation: es },
        fr:    { translation: fr },
        it:    { translation: it },
        ja:    { translation: ja },
        'zh-CN': { translation: zhCN },
        ru:    { translation: ru },
        ko:    { translation: ko },
        'pt-BR': { translation: ptBR },
        pl:    { translation: pl },
        tr:    { translation: tr },
        'zh-TW': { translation: zhTW },
    },
    lng: navigator.language,
    fallbackLng: 'en',
    interpolation: {
        escapeValue: false,
    },
});

export default i18n;
export const { t } = i18n;
