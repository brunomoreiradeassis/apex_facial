import cv2
import customtkinter as ctk
import os
import face_recognition
import numpy as np
from PIL import Image, ImageTk
import threading
import time
import pygame
import requests
import io

# Inicializar o mixer do pygame para áudio
pygame.mixer.init()

# Configurações iniciais do CustomTkinter
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

# CONFIGURAÇÃO DA API
API_URL = "https://apexfacial-production.up.railway.app"

class ApexFacialApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("APEX Facial - Totem de Portaria")
        self.geometry("900x750")
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

        # Caminhos locais
        self.base_path = os.path.dirname(__file__)
        self.rostos_path = os.path.join(self.base_path, "rostos")
        self.audios_path = os.path.join(self.base_path, "audios")
        
        for path in [self.rostos_path, self.audios_path]:
            if not os.path.exists(path): os.makedirs(path)

        # Configuração de grid
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # --- Cabeçalho ---
        self.header_frame = ctk.CTkFrame(self, height=70, corner_radius=0, fg_color="#1a1a1a")
        self.header_frame.grid(row=0, column=0, sticky="nsew")
        self.header_label = ctk.CTkLabel(self.header_frame, text="APEX FACIAL - SISTEMA DE ACESSO", font=ctk.CTkFont(size=22, weight="bold"))
        self.header_label.pack(expand=True)

        # --- Área do Vídeo ---
        self.video_container = ctk.CTkFrame(self, corner_radius=15, border_width=2, border_color="#333")
        self.video_container.grid(row=1, column=0, sticky="nsew", padx=20, pady=20)
        self.video_container.grid_columnconfigure(0, weight=1)
        self.video_container.grid_rowconfigure(0, weight=1)

        self.video_label = ctk.CTkLabel(self.video_container, text="Sincronizando Banco de Dados...")
        self.video_label.grid(row=0, column=0, sticky="nsew")

        # --- Painel de Status ---
        self.status_frame = ctk.CTkFrame(self, height=120, corner_radius=15, fg_color="#121212")
        self.status_frame.grid(row=2, column=0, sticky="nsew", padx=20, pady=(0, 20))
        
        self.status_text = ctk.CTkLabel(self.status_frame, text="Iniciando...", font=ctk.CTkFont(size=24, weight="bold"), text_color="gray")
        self.status_text.pack(expand=True, pady=15)

        # --- Variáveis de Controle ---
        self.cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
        self.known_face_encodings = []
        self.known_face_metadata = [] 
        self.access_cache = {} # Cache de permissões para evitar lag de rede
        
        self.face_locations = []
        self.face_names = []
        self.process_this_frame = True
        self.ultimo_status_audio = None
        self.ultimo_cpf_detectado = None
        self.facial_liberada = False

        # Iniciar sincronização e loop
        threading.Thread(target=self.sync_and_load, daemon=True).start()
        self.update_video()

    def sync_and_load(self):
        """Baixa fotos novas do Railway e carrega encodings localmente."""
        try:
            self.status_text.configure(text="Sincronizando Nuvem...", text_color="#3b82f6")
            response = requests.get(f"{API_URL}/cadastros", timeout=10)
            
            if response.status_code == 200:
                cadastros = response.json()
                new_encodings = []
                new_metadata = []
                
                for p in cadastros:
                    if not p['url_facial'] or p['acesso_bloqueado'] == 'sim': continue
                    
                    # Sanitizar nome para arquivo (remover caracteres que o Windows não aceita)
                    nome_limpo = "".join([c for c in p['nome_completo'] if c.isalnum() or c in (' ', '_')]).strip().replace(' ', '_')
                    cpf_limpo = p['cpf'].replace('.', '').replace('-', '')
                    
                    local_filename = f"{nome_limpo}_{cpf_limpo}.jpg"
                    local_path = os.path.join(self.rostos_path, local_filename)

                    # 1. Baixar se não existir localmente
                    if not os.path.exists(local_path):
                        img_url = p['url_facial']
                        if img_url.startswith('/'): img_url = API_URL + img_url
                        
                        print(f"Baixando: {local_filename}")
                        img_resp = requests.get(img_url, timeout=10)
                        
                        if img_resp.status_code == 200 and 'image' in img_resp.headers.get('Content-Type', ''):
                            with open(local_path, 'wb') as f: f.write(img_resp.content)
                        else:
                            print(f"Erro ao baixar {img_url}: Status {img_resp.status_code}")
                            continue

                    # 2. Carregar encoding
                    try:
                        image = face_recognition.load_image_file(local_path)
                        face_enc = face_recognition.face_encodings(image)
                        if face_enc:
                            new_encodings.append(face_enc[0])
                            new_metadata.append({
                                "nome": p['nome_completo'],
                                "cpf": p['cpf'],
                                "categoria": p['categoria']
                            })
                            self.access_cache[p['cpf']] = (p['categoria'].lower() == "proprietario")
                    except Exception as e:
                        print(f"Erro ao processar {local_filename}: {e}")
                        if os.path.exists(local_path): os.remove(local_path) # Remove se estiver corrompido

                self.known_face_encodings = new_encodings
                self.known_face_metadata = new_metadata
                self.status_text.configure(text="Sistema Pronto", text_color="white")
                
                # Iniciar thread para atualizar cache de visitas em background a cada 1 min
                threading.Thread(target=self.background_permission_sync, daemon=True).start()
                
            else:
                self.status_text.configure(text="Erro API", text_color="red")
        except Exception as e:
            self.status_text.configure(text="Erro de Conexão", text_color="red")
            print(f"Erro Sync: {e}")

    def background_permission_sync(self):
        """Atualiza o cache de quem pode entrar hoje sem travar a câmera."""
        while True:
            try:
                for meta in self.known_face_metadata:
                    if meta['categoria'].lower() == "proprietario": continue
                    
                    resp = requests.get(f"{API_URL}/portaria/verificar/{meta['cpf']}", timeout=5)
                    if resp.status_code == 200:
                        self.access_cache[meta['cpf']] = resp.json().get('permitido', False)
                time.sleep(60) # Atualiza a cada 1 minuto
            except: time.sleep(10)

    def update_video(self):
        ret, frame = self.cap.read()
        if not ret: 
            self.after(10, self.update_video)
            return

        # Otimização: Reduzir frame para reconhecimento
        if self.process_this_frame:
            small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
            rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
            
            self.face_locations = face_recognition.face_locations(rgb_small_frame)
            face_encodings = face_recognition.face_encodings(rgb_small_frame, self.face_locations)

            self.face_names = []
            self.facial_liberada = False

            for face_encoding in face_encodings:
                name = "Desconhecido"
                if len(self.known_face_encodings) > 0:
                    matches = face_recognition.compare_faces(self.known_face_encodings, face_encoding, tolerance=0.5)
                    face_distances = face_recognition.face_distance(self.known_face_encodings, face_encoding)
                    
                    if len(face_distances) > 0:
                        best_idx = np.argmin(face_distances)
                        if matches[best_idx]:
                            meta = self.known_face_metadata[best_idx]
                            # Usa o CACHE em vez de fazer request aqui (FIM DO LAG)
                            if self.access_cache.get(meta['cpf'], False):
                                # Formatar nome para exibir apenas Primeiro e Segundo nome
                                partes_nome = meta['nome'].split()
                                name = " ".join(partes_nome[:2]) if len(partes_nome) > 1 else partes_nome[0]
                                
                                self.facial_liberada = True
                                if self.ultimo_cpf_detectado != meta['cpf']:
                                    threading.Thread(target=self.register_access, args=(meta['cpf'],), daemon=True).start()
                                    self.ultimo_cpf_detectado = meta['cpf']
                            else:
                                name = "Acesso Negado"
                self.face_names.append(name)

        self.process_this_frame = not self.process_this_frame

        # Atualizar UI
        if len(self.face_locations) > 0:
            if self.facial_liberada:
                self.status_text.configure(text=f"LIBERADO: {self.face_names[0]}", text_color="#2ECC71")
                if self.ultimo_status_audio != "ok":
                    self.play_sound("facial_liberada.mp3")
                    self.ultimo_status_audio = "ok"
            else:
                self.status_text.configure(text="ACESSO NEGADO", text_color="#E74C3C")
                if self.ultimo_status_audio != "no":
                    self.play_sound("facial_nao_identificada.mp3")
                    self.ultimo_status_audio = "no"
        else:
            self.status_text.configure(text="Aguardando Aproximação...", text_color="gray")
            self.ultimo_status_audio = None
            self.ultimo_cpf_detectado = None

        # Desenhar Overlays
        for (top, right, bottom, left), name in zip(self.face_locations, self.face_names):
            top *= 4; right *= 4; bottom *= 4; left *= 4
            color = (46, 204, 113) if self.facial_liberada else (231, 76, 60)
            cv2.rectangle(frame, (left, top), (right, bottom), (color[2], color[1], color[0]), 3)
            cv2.rectangle(frame, (left, bottom - 35), (right, bottom), (color[2], color[1], color[0]), cv2.FILLED)
            cv2.putText(frame, name[:20], (left + 6, bottom - 6), cv2.FONT_HERSHEY_DUPLEX, 0.6, (255, 255, 255), 1)

        # Converter para exibição
        img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img_pil = Image.fromarray(img)
        
        # Otimização de redimensionamento para UI
        w, h = self.video_label.winfo_width(), self.video_label.winfo_height()
        if w > 100:
            img_tk = ctk.CTkImage(img_pil, size=(w, h))
            self.video_label.configure(image=img_tk, text="")

        self.after(20, self.update_video)

    def register_access(self, cpf):
        try: requests.post(f"{API_URL}/portaria/registrar_acesso", json={"cpf_categoria": cpf}, timeout=3)
        except: pass

    def play_sound(self, file):
        try:
            pygame.mixer.music.load(os.path.join(self.audios_path, file))
            pygame.mixer.music.play()
        except: pass

    def on_closing(self):
        self.cap.release()
        self.destroy()

if __name__ == "__main__":
    app = ApexFacialApp()
    app.mainloop()
