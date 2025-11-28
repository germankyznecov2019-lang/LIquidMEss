// ИМПОРТЫ FIREBASE SDK (используем CDN для простоты в браузерном окружении)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, query, where, orderBy, onSnapshot, serverTimestamp, arrayUnion, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// ------------------------------------------------------------------
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНФИГУРАЦИЯ
// ------------------------------------------------------------------

// Переменные окружения Canvas (если они определены)
// Используем __app_id для соответствия правилам безопасности Firestore
const appId = typeof __app_id !== 'undefined' ? __app_id : 'liquid-mess-default'; 

// Конфигурация Firebase: используйте свой актуальный конфиг
const firebaseConfig = {
    apiKey: "AIzaSyBkSs6iptVuc0GU-l4eNAYNyoU3wLNjzs",
    authDomain: "liquid-mess.firebaseapp.com",
    projectId: "liquid-mess",
    storageBucket: "liquid-mess.firebasestorage.app",
    messagingSenderId: "125049493568",
    appId: "1:125049493568:web:394939958c03720b88e7a5",
    measurementId: "G-QYHXCMH7RP"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentChatId = null;
let unsubscribeMessages = null;

// ------------------------------------------------------------------
// ФУНКЦИИ ДЛЯ ПОЛУЧЕНИЯ ССЫЛОК НА КОЛЛЕКЦИИ (С УЧЕТОМ CANVAS ПАТТЕРНА)
// ------------------------------------------------------------------

// Public Users: /artifacts/{appId}/public/data/public-users/{userId}
const getPublicUserDocRef = (uid) => doc(db, 'artifacts', appId, 'public', 'data', 'public-users', uid);
const getPublicUsersCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'public-users');

// Groups: /artifacts/{appId}/public/data/groups/{groupId}
const getGroupsCollectionRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'groups');

// Messages (Subcollection of a Group/Chat):
const getMessagesCollectionRef = (chatId) => collection(db, 'artifacts', appId, 'public', 'data', 'groups', chatId, 'messages');

// ------------------------------------------------------------------
// UI ЭЛЕМЕНТЫ
// ------------------------------------------------------------------
const appContainer = document.getElementById('app-container');
const authScreen = document.getElementById('auth-screen');
const chatScreen = document.getElementById('chat-screen');
const signInButton = document.getElementById('sign-in-btn');
const signOutButton = document.getElementById('sign-out-btn');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesList = document.getElementById('messages-list');
const welcomeUser = document.getElementById('welcome-user');
const loadingIndicator = document.getElementById('loading-indicator');
const chatTitle = document.getElementById('chat-title');

// Навигация
const chatTab = document.getElementById('chat-tab');
const groupsTab = document.getElementById('groups-tab');
const chatListPanel = document.getElementById('chat-list-panel');
const groupsPanel = document.getElementById('groups-panel');

// Группы/Поиск
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const createGroupModal = document.getElementById('create-group-modal');
const createGroupForm = document.getElementById('create-group-form');
const groupMemberContainer = document.getElementById('group-member-container');
const groupsList = document.getElementById('groups-list');

let selectedNewMembers = {}; // UID -> displayName

// ------------------------------------------------------------------
// 1. АУТЕНТИФИКАЦИЯ И УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЕМ
// ------------------------------------------------------------------

// Вход через Google
signInButton.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Ошибка входа через Google:", error);
        // Используем alert, так как это критическая ошибка, которую нужно донести до пользователя
        alert(`Ошибка входа: ${error.message}. Пожалуйста, убедитесь, что ваш домен авторизован в консоли Firebase.`); 
    }
});

// Выход из аккаунта
signOutButton.addEventListener('click', () => {
    signOut(auth).catch((error) => {
        console.error("Ошибка выхода:", error);
    });
});

// Сохранение публичного профиля пользователя
async function savePublicProfile(user) {
    const userDocRef = getPublicUserDocRef(user.uid);
    await setDoc(userDocRef, {
        uid: user.uid,
        displayName: user.displayName || user.email.split('@')[0], // Использование части email как запасного имени
        photoURL: user.photoURL || 'https://placehold.co/100x100/A3BDEd/ffffff?text=U',
        email: user.email,
        lastActive: serverTimestamp()
    }, { merge: true });
}

// Слушатель состояния аутентификации
onAuthStateChanged(auth, (user) => {
    loadingIndicator.classList.add('hidden');
    appContainer.classList.remove('hidden');

    if (user) {
        // Пользователь вошел
        savePublicProfile(user); // Обновляем профиль
        authScreen.classList.add('hidden');
        chatScreen.classList.remove('hidden');
        welcomeUser.textContent = user.displayName || user.email.split('@')[0];
        
        // Инициализация чатов
        setupGroupsListener(); 
        switchChat('global-chat-placeholder', 'Общий чат (WIP)'); // Устанавливаем чат по умолчанию

    } else {
        // Пользователь вышел
        chatScreen.classList.add('hidden');
        authScreen.classList.remove('hidden');
    }
});

// ------------------------------------------------------------------
// 2. УПРАВЛЕНИЕ ЧАТАМИ (ГРУППЫ)
// ------------------------------------------------------------------

// Переключение между панелями
chatTab.addEventListener('click', () => {
    chatTab.classList.add('bg-white/30');
    groupsTab.classList.remove('bg-white/30');
    chatListPanel.classList.remove('hidden');
    groupsPanel.classList.add('hidden');
});

groupsTab.addEventListener('click', () => {
    groupsTab.classList.add('bg-white/30');
    chatTab.classList.remove('bg-white/30');
    chatListPanel.classList.add('hidden');
    groupsPanel.classList.remove('hidden');
});


// Слушатель групп пользователя
function setupGroupsListener() {
    const user = auth.currentUser;
    if (!user) return;

    // Запрос: группы, где текущий пользователь является членом
    const q = query(getGroupsCollectionRef(), where("members", "array-contains", user.uid));

    onSnapshot(q, (snapshot) => {
        groupsList.innerHTML = '';
        snapshot.forEach((doc) => {
            const group = doc.data();
            const groupItem = document.createElement('div');
            groupItem.className = 'p-3 rounded-xl hover:bg-white/20 transition duration-200 cursor-pointer mb-2';
            groupItem.innerHTML = `
                <h4 class="font-semibold text-white">${group.name}</h4>
                <p class="text-xs text-white/70">Участников: ${group.members.length}</p>
            `;
            groupItem.addEventListener('click', () => {
                switchChat(doc.id, group.name);
                chatTab.click(); 
            });
            groupsList.appendChild(groupItem);
        });
        
        // Если групп нет, показываем сообщение
        if (snapshot.empty) {
            groupsList.innerHTML = '<p class="text-white/70 text-center mt-4">У вас пока нет групп. Создайте новую!</p>';
        }
    }, (error) => {
        console.error("Ошибка при получении списка групп:", error);
    });
}

// ------------------------------------------------------------------
// 3. ПОИСК ДРУЗЕЙ
// ------------------------------------------------------------------

// Поиск пользователей по имени
searchInput.addEventListener('input', async (e) => {
    const queryText = e.target.value.toLowerCase().trim();
    searchResults.innerHTML = '';
    if (queryText.length < 2) {
        searchResults.innerHTML = '<p class="text-white/60 text-center mt-4 text-sm">Введите имя для поиска.</p>';
        return;
    }

    // Имитация поиска "начинается с" по displayName
    const userQuery = query(
        getPublicUsersCollectionRef(),
        orderBy("displayName"),
        where("displayName", ">=", queryText), 
        where("displayName", "<=", queryText + '\uf8ff')
    );

    try {
        const snapshot = await getDocs(userQuery);
        snapshot.forEach((doc) => {
            const user = doc.data();
            if (user.uid !== auth.currentUser.uid) {
                renderSearchResult(user);
            }
        });

        if (snapshot.empty) {
            searchResults.innerHTML = '<p class="text-white/70 text-center mt-4">Пользователи не найдены.</p>';
        }

    } catch (error) {
        console.error("Ошибка поиска пользователей:", error);
    }
});

// Отображение результатов поиска
function renderSearchResult(user) {
    const isSelected = selectedNewMembers.hasOwnProperty(user.uid);
    
    const resultItem = document.createElement('div');
    resultItem.className = 'flex items-center justify-between p-3 glass rounded-xl mb-2 transition-transform duration-200';
    resultItem.innerHTML = `
        <div class="flex items-center">
            <img src="${user.photoURL}" alt="${user.displayName}" class="w-10 h-10 rounded-full mr-3">
            <span class="text-white font-medium">${user.displayName}</span>
        </div>
        <button data-uid="${user.uid}" data-name="${user.displayName}" 
                class="select-member-btn px-3 py-1 text-sm rounded-full transition duration-200 
                ${isSelected ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}">
            ${isSelected ? 'Удалить' : 'Добавить'}
        </button>
    `;

    const btn = resultItem.querySelector('.select-member-btn');
    btn.addEventListener('click', (e) => toggleMemberSelection(e.currentTarget, user.uid, user.displayName));
    
    searchResults.appendChild(resultItem);
}

// Переключение выбора участника для создания группы
function toggleMemberSelection(button, uid, displayName) {
    if (selectedNewMembers.hasOwnProperty(uid)) {
        delete selectedNewMembers[uid];
        button.textContent = 'Добавить';
        button.classList.remove('bg-red-500', 'hover:bg-red-600');
        button.classList.add('bg-blue-500', 'hover:bg-blue-600');
    } else {
        selectedNewMembers[uid] = displayName;
        button.textContent = 'Удалить';
        button.classList.remove('bg-blue-500', 'hover:bg-blue-600');
        button.classList.add('bg-red-500', 'hover:bg-red-600');
    }
    renderSelectedMembers();
}

// Отображение выбранных участников
function renderSelectedMembers() {
    groupMemberContainer.innerHTML = '';
    
    // Добавляем текущего пользователя (он всегда участник)
    const currentUser = auth.currentUser;
    if (currentUser) {
        const selfChip = createMemberChip(currentUser.displayName || "Я", true);
        groupMemberContainer.appendChild(selfChip);
    }

    // Добавляем выбранных друзей
    for (const uid in selectedNewMembers) {
        const name = selectedNewMembers[uid];
        const chip = createMemberChip(name);
        groupMemberContainer.appendChild(chip);
    }

    // Обновляем кнопку создания
    const createBtn = document.getElementById('submit-create-group');
    if (Object.keys(selectedNewMembers).length > 0) {
        createBtn.disabled = false;
        createBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        createBtn.disabled = true;
        createBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

function createMemberChip(name, isSelf = false) {
    const chip = document.createElement('span');
    chip.className = `inline-flex items-center px-3 py-1 rounded-full text-sm font-medium m-1 ${isSelf ? 'bg-green-500/80 text-white' : 'bg-indigo-500/80 text-white'}`;
    chip.textContent = name;
    return chip;
}

// ------------------------------------------------------------------
// 4. СОЗДАНИЕ ГРУППЫ
// ------------------------------------------------------------------

// Открытие модального окна создания группы
document.getElementById('open-create-group').addEventListener('click', () => {
    createGroupModal.classList.remove('hidden');
    selectedNewMembers = {}; // Сброс выбора
    renderSelectedMembers();
    // Повторно отображаем результаты поиска, чтобы обновить кнопки "Добавить/Удалить"
    searchInput.dispatchEvent(new Event('input')); 
});

// Закрытие модального окна
document.getElementById('close-create-group').addEventListener('click', () => {
    createGroupModal.classList.add('hidden');
});

// Создание группы
createGroupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const groupName = document.getElementById('group-name-input').value.trim();
    const user = auth.currentUser;

    if (!user || !groupName) return;

    // UID всех участников: текущий пользователь + выбранные друзья
    const memberUids = [user.uid, ...Object.keys(selectedNewMembers)];

    try {
        await addDoc(getGroupsCollectionRef(), {
            name: groupName,
            members: memberUids,
            admin: user.uid,
            createdAt: serverTimestamp()
        });

        // Используем alert для уведомления об успехе
        alert(`Группа "${groupName}" успешно создана!`); 
        
        // Закрытие модального окна и очистка
        createGroupModal.classList.add('hidden');
        createGroupForm.reset();
        selectedNewMembers = {};
        groupsTab.click(); // Переход на список групп

    } catch (error) {
        console.error("Ошибка при создании группы:", error);
        alert("Ошибка при создании группы. Попробуйте снова.");
    }
});


// ------------------------------------------------------------------
// 5. ЛОГИКА ЧАТА И ПЕРЕКЛЮЧЕНИЕ ЧАТОВ
// ------------------------------------------------------------------

// Переключение активного чата
function switchChat(chatId, name) {
    if (unsubscribeMessages) {
        unsubscribeMessages(); // Отписываемся от предыдущего чата
    }
    currentChatId = chatId;
    chatTitle.textContent = name;
    messagesList.innerHTML = '<p class="text-center text-white/70">Загрузка сообщений...</p>';
    setupMessageListener(chatId);
}

// ------------------------------------------------------------------
// 6. ОТПРАВКА/ПОЛУЧЕНИЕ СООБЩЕНИЙ
// ------------------------------------------------------------------

messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    const messageText = messageInput.value.trim();

    if (!user || messageText === '' || !currentChatId || currentChatId === 'global-chat-placeholder') {
        // Заглушка, пока не выбран реальный чат
        if(currentChatId === 'global-chat-placeholder') {
             alert("Пожалуйста, создайте или выберите реальную группу для отправки сообщений.");
        }
        return;
    }

    try {
        await addDoc(getMessagesCollectionRef(currentChatId), {
            uid: user.uid,
            username: user.displayName || user.email.split('@')[0],
            photoURL: user.photoURL,
            text: messageText,
            timestamp: serverTimestamp()
        });

        messageInput.value = ''; // Очистка ввода
        messageInput.focus();

    } catch (error) {
        console.error("Ошибка при отправке сообщения:", error);
    }
});

// Слушатель сообщений в реальном времени
function setupMessageListener(chatId) {
    if (chatId === 'global-chat-placeholder') {
        messagesList.innerHTML = `<p class="text-center text-white/70">
            Это тестовый чат. Чтобы начать общение, перейдите во вкладку "Поиск & Группы" и создайте свою первую группу.
        </p>`;
        return;
    }

    const q = query(getMessagesCollectionRef(chatId), orderBy("timestamp", "asc"));

    // Сохраняем функцию отписки
    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        messagesList.innerHTML = ''; 

        snapshot.forEach((doc) => {
            const data = doc.data();
            const user = auth.currentUser;
            const isCurrentUser = user && user.uid === data.uid;
            
            const messageElement = document.createElement('div');
            messageElement.classList.add('message-item', 'flex', 'mb-4', 'p-3', 'rounded-xl', 'max-w-[80%]', 'break-words', 'shadow-lg', 'transition-all', 'duration-200');
            
            // Стиль для исходящих (ваших) сообщений
            if (isCurrentUser) {
                messageElement.classList.add('ml-auto', 'bg-blue-600/80', 'text-white', 'text-right', 'flex-row-reverse');
            } else {
                // Стиль для входящих сообщений
                messageElement.classList.add('bg-white/90', 'text-gray-900', 'shadow-sm', 'flex-row');
            }

            const time = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...';

            const avatar = data.photoURL ? 
                `<img src="${data.photoURL}" alt="${data.username}" onerror="this.src='https://placehold.co/100x100/A3BDEd/ffffff?text=U'" class="w-8 h-8 rounded-full ${isCurrentUser ? 'ml-3' : 'mr-3'} flex-shrink-0">` : 
                `<div class="w-8 h-8 rounded-full ${isCurrentUser ? 'ml-3' : 'mr-3'} flex-shrink-0 bg-gray-400 flex items-center justify-center text-xs font-bold text-white">${data.username[0] || '?'}</div>`;

            messageElement.innerHTML = `
                ${avatar}
                <div class="flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'} w-full">
                    <span class="text-xs font-semibold mb-1 ${isCurrentUser ? 'text-blue-100' : 'text-blue-600'}">
                        ${data.username}
                    </span>
                    <p class="text-sm leading-snug">${data.text}</p>
                    <span class="text-[0.65rem] mt-1 opacity-70 ${isCurrentUser ? 'text-white' : 'text-gray-600'}">${time}</span>
                </div>
            `;
            
            messagesList.appendChild(messageElement);
        });

        // Автоматическая прокрутка вниз
        messagesList.scrollTop = messagesList.scrollHeight;
    }, (error) => {
        console.error("Ошибка при получении сообщений:", error);
        messagesList.innerHTML = `<p class="text-center text-red-300">Ошибка загрузки чата: ${error.message}</p>`;
    });
}
