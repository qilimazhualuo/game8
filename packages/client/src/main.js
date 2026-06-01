import { createApp } from 'vue'
import { Quasar } from 'quasar'
import quasarLang from 'quasar/lang/zh-CN'
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/dist/quasar.css'

import App from '@/App.vue'
import router from '@/router/index.js'

const app = createApp(App)

app.use(Quasar, {
    lang: quasarLang,
})

app.use(router)
app.mount('#app')
