const tape = document.getElementById('tape');
const btn = document.getElementById('spinBtn');
const overlay = document.getElementById('overlay');
const winnerCard = document.getElementById('winnerCard');

const items = [
    "BITCOIN", "MAX", "APPLE", "ANDROID", 
    "WINDOWS", "LINUX", "WI-FI", "BLUETOOTH", "GOOGLE"
];

const CARD_WIDTH = 180; // Ширина карточки (160 + 20 отступы)

// Создаем длинную ленту для эффекта вращения
function buildTape() {
    // Повторим массив 15 раз для запаса прокрутки
    for (let i = 0; i < 15; i++) {
        items.forEach((name, index) => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = 
                <img src="img/${index + 1}.png">
                <span>${name}</span>
            ;
            tape.appendChild(div);
        });
    }
}

buildTape();

btn.onclick = () => {
    btn.disabled = true;
    
    // Выбираем случайный индекс из основного набора (0-8)
    const randomIndex = Math.floor(Math.random() * items.length);
    
    // Считаем, сколько карточек пропустить (например, 70 штук для долгого вращения)
    // плюс индекс нашей картинки
    const targetCardIndex = 70 + randomIndex;
    
    // Смещение. Центрируем по середине экрана
    const offset = (targetCardIndex * CARD_WIDTH) - (window.innerWidth / 2) + (CARD_WIDTH / 2);
    
    tape.style.transform = translateX(-${offset}px);

    // Ждем окончания анимации (5 секунд в CSS)
    setTimeout(() => {
        showWinner(randomIndex);
    }, 5500);
};

function showWinner(idx) {
    winnerCard.innerHTML = 
        <img src="img/${idx + 1}.png" style="width:100px">
        <h3>${items[idx]}</h3>
    ;
    overlay.style.display = 'flex';
}

function reset() {
    window.location.reload();
}
