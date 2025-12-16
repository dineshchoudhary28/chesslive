// front/public/js/chat.js

// DOM Elements
const $chatMessages = $('#chatMessages');
const $chatInput = $('#chatInput');
const $sendMessage = $('#sendMessage');
const $chatContainer = $('#chatContainer');
const $toggleChat = $('#toggleChat');

// Chat state
let isChatVisible = true;
let unreadMessages = 0;

// Initialize chat functionality
function initializeChat() {
    console.log('Initializing chat module');
    
    // Send message on button click
    $sendMessage.on('click', sendChatMessage);
    
    // Send message on Enter key
    $chatInput.on('keypress', function(e) {
        if (e.which === 13) { // Enter key
            sendChatMessage();
            e.preventDefault();
        }
    });
    
    // Toggle chat visibility
    $toggleChat.on('click', toggleChatVisibility);
    
    // Listen for incoming messages
    socket.on('newMessage', function(message) {
        console.log('Received new message:', message);
        addChatMessage(message);
        
        // Increment unread counter if chat is hidden
        if (!isChatVisible) {
            unreadMessages++;
            updateUnreadBadge();
        }
    });
    
    // Handle chat history when joining a game
    socket.on('chatHistory', function(messages) {
        console.log('Received chat history:', messages);
        if (Array.isArray(messages)) {
            messages.forEach(message => {
                addChatMessage(message);
            });
        }
    });
}

// Send chat message
function sendChatMessage() {
    const message = $chatInput.val().trim();
    if (!message) return;
    
    console.log('Sending message:', message);
    
    // Send message to server
    socket.emit('chatMessage', message);
    
    // Clear input
    $chatInput.val('');
    $chatInput.focus();
}

// Add message to chat display
function addChatMessage(message) {
    console.log('Adding message to chat display:', message);
    
    // Format timestamp
    const timestamp = formatMessageTime(message.time);
    
    // Handle system messages differently
    if (message.sender === 'System') {
        const systemMessageHtml = `
            <div class="chat-message system-message">
                <div class="chat-text">${sanitizeMessage(message.text)}</div>
                <span class="chat-time">${timestamp}</span>
            </div>
        `;
        $chatMessages.append(systemMessageHtml);
    } else {
        const isSelf = message.sender === username;
        const messageHtml = `
            <div class="chat-message ${isSelf ? 'chat-message-self' : 'chat-message-other'}">
                ${!isSelf ? `<div class="chat-sender">${sanitizeMessage(message.sender)}</div>` : ''}
                <div class="chat-text">${sanitizeMessage(message.text)}</div>
                <span class="chat-time">${timestamp}</span>
            </div>
        `;
        $chatMessages.append(messageHtml);
    }
    
    // Scroll to bottom
    scrollChatToBottom();
}

// Format message time (from timestamp to readable format)
function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        console.error('Error formatting time:', e);
        return '';
    }
}

// Sanitize message content to prevent XSS
function sanitizeMessage(text) {
    if (!text) return '';
    return $('<div>').text(text).html();
}

// Scroll chat to bottom
function scrollChatToBottom() {
    $chatMessages.scrollTop($chatMessages[0].scrollHeight);
}

// Toggle chat visibility
function toggleChatVisibility() {
    isChatVisible = !isChatVisible;
    
    if (isChatVisible) {
        $chatContainer.removeClass('chat-hidden');
        $toggleChat.text('Hide Chat');
        // Reset unread counter
        unreadMessages = 0;
        updateUnreadBadge();
    } else {
        $chatContainer.addClass('chat-hidden');
        $toggleChat.text('Show Chat');
    }
    
    // Adjust board size when chat visibility changes
    if (typeof board !== 'undefined' && board !== null) {
        board.resize();
    }
}

// Update unread messages badge
function updateUnreadBadge() {
    const $badge = $('#chatBadge');
    
    if (unreadMessages > 0) {
        if ($badge.length === 0) {
            $toggleChat.append(`<span id="chatBadge" class="chat-badge">${unreadMessages}</span>`);
        } else {
            $badge.text(unreadMessages);
        }
    } else {
        $badge.remove();
    }
}

// Show an emoji picker (if enabled in your application)
function showEmojiPicker() {
    // Implementation depends on your chosen emoji picker library
    // Example: $('#emojiPicker').toggle();
}

// Send a predefined message (like "Good game!" or "Your move")
function sendQuickMessage(messageType) {
    let message = '';
    
    switch(messageType) {
        case 'goodGame':
            message = 'Good game!';
            break;
        case 'yourMove':
            message = 'Your move!';
            break;
        case 'thinking':
            message = 'I\'m thinking...';
            break;
        case 'goodLuck':
            message = 'Good luck!';
            break;
        default:
            return;
    }
    
    $chatInput.val(message);
    sendChatMessage();
}

// Make chat draggable/resizable (optional)
function makeChatDraggable() {
    $chatContainer.draggable({
        handle: '.chat-header',
        containment: 'window'
    });
    
    $chatContainer.resizable({
        minHeight: 200,
        minWidth: 250,
        maxHeight: 600,
        maxWidth: 400,
        stop: function() {
            scrollChatToBottom();
        }
    });
}

// Initialize when document is ready
$(document).ready(function() {
    console.log('Chat.js loaded');
    initializeChat();
    
    // If you're using jQuery UI for draggable/resizable
    // makeChatDraggable();
    
    // Add quick message buttons if present
    $('.quick-message-btn').on('click', function() {
        const messageType = $(this).data('message-type');
        sendQuickMessage(messageType);
    });
});