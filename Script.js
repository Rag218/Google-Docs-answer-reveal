// ==UserScript==
// @name         Google Docs Task Answer Finder
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Busca respostas de questões em páginas web a partir do Google Docs
// @author       Rag
// @match        https://docs.google.com/document/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==
(function() {
    'use strict';
    GM_addStyle(`
        .answer-finder-container {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 300px;
            background white;
            border: 2px solid #1a73e8;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-family: Arial, sans-serif;
            resize: both;
            overflow: hidden;
            min-width: 250px;
            min-height: 150px;
        }
        .answer-finder-header {
            background: #1a73e8;
            color: white;
            padding: 10px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: bold;
            user-select: none;
        }
        .answer-finder-close {
            cursor: pointer;
            font-size: 18px;
            padding: 0 5px;
        }
        .answer-finder-close:hover {
            opacity: 0.8;
        }
        .answer-finder-content {
            padding: 15px;
            max-height: 400px;
            overflow-y: auto;
        }
        .answer-finder-input-group {
            display: flex;
            gap: 8px;
            margin-bottom: 15px;
        }
        .answer-finder-input {
            flex: 1;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 14px;
        }
        .answer-finder-button {
            padding: 8px 15px;
            background: #1a73e8;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .answer-finder-button:hover {
            background: #1557b0;
        }
        .answer-finder-button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .answer-finder-results {
            margin-top: 15px;
        }
        .answer-item {
            background: #f8f9fa;
            border-left: 3px solid #1a73e8;
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 0 4px 4px 0;
        }
        .answer-item-question {
            font-weight: bold;
            margin-bottom: 5px;
            color: #333;
            font-size: 13px;
        }
        .answer-item-answer {
            color: #1a73e8;
            margin-bottom: 3px;
            font-size: 14px;
        }
        .answer-item-context {
            font-size: 11px;
            color: #666;
            font-style: italic;
        }
        .answer-finder-loading {
            text-align: center;
            padding: 20px;
            color: #666;
        }
        .answer-finder-error {
            color: #d32f2f;
            padding: 10px;
            background: #ffebee;
            border-radius: 4px;
            margin-top: 10px;
            font-size: 13px;
        }
    `);
    function extractAnswers(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const answers = [];
        const patterns = [
            {
                question: /h[3-6]|strong|b|.question|.pergunta/i,
                answer: /p|div|.answer|.resposta/i,
                context: 'Próximo elemento'
            },
            {
                pattern: /([A-D]\)|\([A-D]\)|\d+\.)\s*([^<>]+)/g,
                context: 'Alternativa'
            },
            {
                pattern: /(gabarito|resposta|answer)[:\s]+([A-D, ]+)/gi,
                context: 'Gabarito'
            },
            {
                pattern: /(questão|questao|question)\s*(\d+)[:\s]*([^<>]+)/gi,
                context: 'Questão numerada'
            }
        ];
        const text = doc.body.textContent || '';
        const elements = doc.body.getElementsByTagName('*');
        let currentQuestion = null;
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            const text = el.textContent.trim();
            if (text && text.length > 10 && text.length < 200) {
                if (text.includes('?') || text.match(/^(qual|como|quando|onde|por que|explique|defina)/i)) {
                    currentQuestion = text;
                }
                else if (currentQuestion && text.length > 5 && !text.includes('?')) {
                    answers.push({
                        question: currentQuestion,
                        answer: text,
                        context: 'Provável resposta'
                    });
                    currentQuestion = null;
                }
            }
        }
        patterns.forEach(pattern => {
            if (pattern.pattern) {
                const matches = text.matchAll(pattern.pattern);
                for (const match of matches) {
                    answers.push({
                        question: match[1] || 'Questão',
                        answer: match[2] || match[0],
                        context: pattern.context
                    });
                }
            }
        });
        return answers.slice(0, 10);
    }
    function fetchUrlContent(url, callback) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function(response) {
                if (response.status === 200) {
                    callback(null, response.responseText);
                } else {
                    callback('Erro ao carregar página: ' + response.status);
                }
            },
            onerror: function(error) {
                callback('Erro na requisição: ' + error);
            }
        });
    }
    function createFloatingBox() {
        const container = document.createElement('div');
        container.className = 'answer-finder-container';
        container.innerHTML = `
            <div class="answer-finder-header">
                <span>🔍 Buscador de Respostas</span>
                <span class="answer-finder-close">×</span>
            </div>
            <div class="answer-finder-content">
                <div class="answer-finder-input-group">
                    <input type="text" class="answer-finder-input" placeholder="Insira a URL da tarefa..." value="">
                    <button class="answer-finder-button">Buscar</button>
                </div>
                <div class="answer-finder-results"></div>
            </div>
        `;
        document.body.appendChild(container);
        makeDraggable(container);
        const closeBtn = container.querySelector('.answer-finder-close');
        const input = container.querySelector('.answer-finder-input');
        const button = container.querySelector('.answer-finder-button');
        const results = container.querySelector('.answer-finder-results');
        closeBtn.addEventListener('click', () => {
            container.remove();
        });
        button.addEventListener('click', () => {
            const url = input.value.trim();
            if (url) {
                searchAnswers(url, results, button);
            } else {
                results.innerHTML = '<div class="answer-finder-error">Por favor, insira uma URL</div>';
            }
        });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                button.click();
            }
        });
        return container;
    }
    function searchAnswers(url, resultsElement, buttonElement) {
        resultsElement.innerHTML = '<div class="answer-finder-loading">🔍 Buscando respostas...</div>';
        buttonElement.disabled = true;
        fetchUrlContent(url, (error, html) => {
            buttonElement.disabled = false;
            if (error) {
                resultsElement.innerHTML = `<div class="answer-finder-error">${error}</div>`;
                return;
            }
            const answers = extractAnswers(html);
            if (answers.length === 0) {
                resultsElement.innerHTML = '<div class="answer-finder-error">Nenhuma resposta encontrada na página</div>';
                return;
            }
            let html_results = '';
            answers.forEach((answer, index) => {
                html_results += `
                    <div class="answer-item">
                        <div class="answer-item-question">📝 ${answer.question || 'Questão ' + (index + 1)}</div>
                        <div class="answer-item-answer">✅ ${answer.answer}</div>
                        <div class="answer-item-context">${answer.context || 'Resposta encontrada'}</div>
                    </div>
                `;
            });
            resultsElement.innerHTML = html_results;
            const container = resultsElement.closest('.answer-finder-container');
            const newHeight = Math.min(500, 200 + answers.length * 70);
            container.style.height = newHeight + 'px';
        });
    }
    function makeDraggable(element) {
        const header = element.querySelector('.answer-finder-header');
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;
        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        function dragStart(e) {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            if (e.target === header || header.contains(e.target)) {
                isDragging = true;
            }
        }
        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                setTranslate(currentX, currentY, element);
            }
        }
        function setTranslate(xPos, yPos, el) {
            el.style.transform = `translate(${xPos}px, ${yPos}px)`;
        }
        function dragEnd() {
            isDragging = false;
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createFloatingBox();
        });
    } else {
        createFloatingBox();
    }
})();
