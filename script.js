// ЗАМЕНИТЕ ЭТО СВОИМИ ДАННЫМИ КОНФИГУРАЦИИ ИЗ КОНСОЛИ FIREBASE
const firebaseConfig = {
    apiKey: "ВАШ_API_KEY",
    authDomain: "ВАШ_AUTH_DOMAIN",
    projectId: "ВАШ_PROJECT_ID",
    storageBucket: "ВАШ_STORAGE_BUCKET",
    messagingSenderId: "ВАШ_MESSAGING_SENDER_ID",
    appId: "ВАШ_APP_ID"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const messagesList = document.getElementById('messages-list');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const usernameInput = document.getElementById('username-input');

// 1. ОТПРАВКА СООБЩЕНИЙ
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = usernameInput.value || 'Аноним';
    const message = messageInput.value;

    if (message.trim() === '') return; // Проверка на пустое сообщение

    db.collection("messages").add({
        username: username,
        text: message,
        timestamp: firebase.firestore.FieldValue.serverTimestamp() // Время на сервере
    })
    .then(() => {
        messageInput.value = ''; // Очистка поля ввода
        messageInput.focus();
    })
    .catch((error) => {
        console.error("Ошибка при добавлении документа: ", error);
    });
});

// 2. ПОЛУЧЕНИЕ СООБЩЕНИЙ В РЕАЛЬНОМ ВРЕМЕНИ
db.collection("messages")
    .orderBy("timestamp", "asc") // Сортируем по времени
    .limit(50) // Ограничиваем количество сообщений
    .onSnapshot((snapshot) => {
        // Очищаем список перед добавлением новых
        messagesList.innerHTML = ''; 

        snapshot.forEach((doc) => {
            const data = doc.data();
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
            
            // Форматирование времени для отображения
            const time = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString() : '...';

            messageElement.innerHTML = `
                <span class="message-header">
                    <strong>${data.username}</strong> <span class="time">${time}</span>
                </span>
                <p>${data.text}</p>
            `;
            messagesList.appendChild(messageElement);
        });

        // Прокрутка вниз к последнему сообщению
        messagesList.scrollTop = messagesList.scrollHeight;
    });