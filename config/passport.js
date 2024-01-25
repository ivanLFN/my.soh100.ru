const User = require('../models/user');
const LocalStrategy = require('passport-local').Strategy;
const passport = require('passport');
const bcrypt = require('bcryptjs');

// Используем простейшую стратегию с логином и паролем
// Находим пользователя и сравниваем хэши паролей
passport.use(new LocalStrategy({ usernameField: 'phone' },
     function (phone, password, done) {
        User.getUserByPhone(phone, async function (err, user) {
            if (err) {
                return done(err)
            }
            if (!user) {
                return done(null, false)
            }
            if (await bcrypt.compare(password, user.password)) 
                return done(null, user) // успешная аутентификация
            else
                return done(null, false)
        })
    }
))

// В куках клиента будет содержаться информация об id пользователя. Каждый раз, когда он делает запрос
// на сервер, из БД по id будет подгружаться информация о пользователе и автоматически добавляться в объект запроса.
// В принципе можно было и вручную получать данные о пользователе, но это каждый раз пришлось бы прописывать обращение к БД.
// Поэтому добавлены 2 этих функции.
// И наоборот, когда сервер формирует ответ, он добавляет id пользователя в куки. Id он берет из объекта пользователя

passport.serializeUser(function (user, done) { // при ответе клиенту
    done(null, user._id);
});

passport.deserializeUser(function (id, done) {  // при запросе клиента
    User.getUserById(id, function (err, user) {
        done(err, user);
    });
});