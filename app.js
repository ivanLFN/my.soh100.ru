/**
 * Этот модуль пикрепляет дополнительные библиотеки для упрощения работы с http запросами,
 * формированием html страниц, авторизацией;
 * Express - библиотека для маршрутизации по сайту. Маршруты описаны в файле routers.js;
 * Session - модуль отвечает за http сессии, вместе с passport обеспечивает работу авторизации;
 * Cors - модуль добавляет в headr http запроса дополнительные поля. Если в коде html страницы мы делаем
 * запрос на наш сервер (ajax-запрос) с другой машины, то express будет блокировать его, поскольку нарушается
 * cors-policy. Чтобы этого не проиходило, подключается модуль cors;
 * CookieParser - модуль для работы с cookie. В них хранится информация о сессии;
 * Redis - быстродействующее хранилища данных. В нем хранятся все сессии пользователей, коды СМС;
 * Express-handlebars - шаблонизатор html страниц. Им мы генерируем и заполняем страницу;
 * Body-parser - без него невозможна работа post-запросов. Express не умеет обрабатывать тело запроса, поэтому
 * используется эта библиотека для парсинга данных;
 * http - http-сервер. Фактически работает 2 экземпляра этого модуля - для незащищенного и защищенного соединения.
 * Под Windows эти экземпляры могут работать на 80 и 443 порту соответственно. Однако в Ubuntu на 443 порту nodejs
 * работать не хочет. Поэтому используется прокси-сервер NGINX, который перенаправляет входящие запросы приложению
 * nodejs на 3000 и 3443 порт;
 */

const config = require('./config/config');
let express = require('express');
let session = require('express-session');
let cors = require('cors');
const cookieParser = require('cookie-parser');

const redis = require('redis')
const RedisStore = require('connect-redis')(session)
let redisClient = redis.createClient({ host: config.redisStore.host })

let exphbs = require('express-handlebars');
let bodyParser = require('body-parser');

const passport = require('passport');
const router = require('./router/router');

let app = express();
let serverHttp = require('http').Server(app); // Добавляем к http серверу модуль для работы с маршрутами
let serverHttpSSL = require('http').Server(app);

// Добавляем к http серверу модуль для работы с сессиями
app.use(session({
    store: new RedisStore({ // Данные о сессиях будут храниться в Redis
        client: redisClient
    }),
    cookie: {
        path: '/',
        httpOnly: true,
        secure: false,
        maxAge: config.sessionTimeoutDays * 24 * 60 * 60 * 1000 // время жизни сессии
    },
    secret: config.secretSessionKey,// приватный ключ, которым будут шифроваться сессии
    resave: false,
    rolling: true,// продливать сессию при повторном обращении на сервер
    saveUninitialized: false
}))

app.use(cookieParser(config.secretSessionKey));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json());

require('./config/passport');// указываем стратегию авторизации для passport
app.use(passport.initialize());
app.use(passport.session());
app.use(cors());


// прописываем дополнительные условия, по которым будут заполняться данные html страницы
// эти условия можно будет найти непосредственно в шаблонах страниц
let hbs = exphbs.create(
    {
        defaultLayout: "main.hbs",
        extname: ".hbs",
        helpers: {
            if_ls: (a, b) => { if (a < b) { return true; } else return false; },
            if_de: (a) => { if ((a >= 10) && (!(a % 10))) { return true; } else return false; },
            if_eq: (a, b) => {if(a === b){return true; } else return false;}
        }
    }
)

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.use('/', router);

// После подключения всех библиотек экспортируем экземпляры серверов для вызова в server.js
module.exports.serverHttp = serverHttp;
module.exports.serverHttpSSL = serverHttpSSL;

