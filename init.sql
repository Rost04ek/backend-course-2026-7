CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO items (title, description) VALUES 
('Перший запис', 'Опис для тестування Docker + DB'),
('Другий запис', 'Все працює коректно!');