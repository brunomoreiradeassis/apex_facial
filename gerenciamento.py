import customtkinter as ctk
import requests
import os
from tkinter import filedialog, messagebox
from PIL import Image
import json

# Configurações de Estética
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

# CONFIGURAÇÃO DA API (Substitua pela sua URL do Railway)
API_URL = "https://apexfacial-production.up.railway.app"

class GerenciamentoPortaria(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("APEX Facial - Gerenciamento da Portaria")
        self.geometry("1000x700")

        # Layout Principal
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # --- Sidebar de Navegação ---
        self.sidebar = ctk.CTkFrame(self, width=200, corner_radius=0)
        self.sidebar.grid(row=0, column=0, sticky="nsew")
        
        self.logo_label = ctk.CTkLabel(self.sidebar, text="APEX Facial\nAdmin", font=ctk.CTkFont(size=20, weight="bold"))
        self.logo_label.pack(pady=20)

        self.btn_cadastros = ctk.CTkButton(self.sidebar, text="Pessoas", command=lambda: self.show_frame("pessoas"))
        self.btn_cadastros.pack(pady=10, padx=10)

        self.btn_visitas = ctk.CTkButton(self.sidebar, text="Autorizar Visita", command=lambda: self.show_frame("visitas"))
        self.btn_visitas.pack(pady=10, padx=10)

        # --- Área de Conteúdo ---
        self.container = ctk.CTkFrame(self)
        self.container.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)
        self.container.grid_columnconfigure(0, weight=1)
        self.container.grid_rowconfigure(0, weight=1)

        self.frames = {}
        self.init_pessoas_frame()
        self.init_visitas_frame()

        self.show_frame("pessoas")

    def show_frame(self, page_name):
        frame = self.frames[page_name]
        frame.tkraise()

    def init_pessoas_frame(self):
        frame = ctk.CTkFrame(self.container)
        self.frames["pessoas"] = frame
        frame.grid(row=0, column=0, sticky="nsew")

        ctk.CTkLabel(frame, text="Cadastrar Nova Pessoa", font=ctk.CTkFont(size=24, weight="bold")).pack(pady=20)

        self.entry_nome = ctk.CTkEntry(frame, placeholder_text="Nome Completo", width=400)
        self.entry_nome.pack(pady=10)

        self.entry_cpf = ctk.CTkEntry(frame, placeholder_text="CPF (apenas números)", width=400)
        self.entry_cpf.pack(pady=10)

        self.option_cat = ctk.CTkOptionMenu(frame, values=["Proprietario", "Parentesco", "Visitante", "Prestador", "Esporadico"], width=400)
        self.option_cat.pack(pady=10)

        self.entry_tel = ctk.CTkEntry(frame, placeholder_text="Telefone", width=400)
        self.entry_tel.pack(pady=10)

        self.btn_foto = ctk.CTkButton(frame, text="Selecionar Foto Facial", command=self.pick_file, fg_color="transparent", border_width=2)
        self.btn_foto.pack(pady=10)
        self.foto_path = ""

        self.btn_salvar = ctk.CTkButton(frame, text="Salvar Cadastro no Railway", command=self.save_pessoa, fg_color="#2ECC71", hover_color="#27AE60")
        self.btn_salvar.pack(pady=30)

    def init_visitas_frame(self):
        frame = ctk.CTkFrame(self.container)
        self.frames["visitas"] = frame
        frame.grid(row=0, column=0, sticky="nsew")

        ctk.CTkLabel(frame, text="Autorizar Acesso Temporário", font=ctk.CTkFont(size=24, weight="bold")).pack(pady=20)

        self.v_cpf_visitante = ctk.CTkEntry(frame, placeholder_text="CPF do Visitante/Prestador", width=400)
        self.v_cpf_visitante.pack(pady=10)

        self.v_data = ctk.CTkEntry(frame, placeholder_text="Data da Visita (AAAA-MM-DD)", width=400)
        self.v_data.pack(pady=10)

        self.v_cpf_prop = ctk.CTkEntry(frame, placeholder_text="CPF do Proprietário que Autorizou", width=400)
        self.v_cpf_prop.pack(pady=10)

        self.btn_autorizar = ctk.CTkButton(frame, text="Agendar na Portaria", command=self.save_visita, fg_color="#3498DB")
        self.btn_autorizar.pack(pady=30)

    def pick_file(self):
        self.foto_path = filedialog.askopenfilename(filetypes=[("Imagens", "*.jpg *.jpeg *.png")])
        if self.foto_path:
            self.btn_foto.configure(text=f"Foto: {os.path.basename(self.foto_path)}", text_color="green")

    def save_pessoa(self):
        nome = self.entry_nome.get()
        cpf = self.entry_cpf.get()
        cat = self.option_cat.get()
        tel = self.entry_tel.get()

        if not nome or not cpf or not self.foto_path:
            messagebox.showwarning("Erro", "Preencha nome, CPF e selecione uma foto!")
            return

        data = {
            "nome_completo": nome,
            "cpf": cpf,
            "categoria": cat,
            "telefone": tel,
            "acesso_bloqueado": "nao"
        }

        try:
            with open(self.foto_path, 'rb') as f:
                files = {'foto': f}
                response = requests.post(f"{API_URL}/cadastros", data=data, files=files)
            
            if response.status_code == 201:
                messagebox.showinfo("Sucesso", "Pessoa cadastrada no Railway!")
                self.clear_form()
            else:
                messagebox.showerror("Erro", f"Falha na API: {response.text}")
        except Exception as e:
            messagebox.showerror("Erro", f"Erro de conexão: {e}")

    def save_visita(self):
        cpf_v = self.v_cpf_visitante.get()
        data_v = self.v_data.get()
        cpf_p = self.v_cpf_prop.get()

        if not cpf_v or not data_v:
            messagebox.showwarning("Erro", "Preencha CPF e Data!")
            return

        payload = {
            "cpf_categoria": cpf_v,
            "data_visita": data_v,
            "cpf_prorpietario": cpf_p,
            "categoria": "Visitante", # Simplificado para o exemplo
            "nome_categoria": "Visitante", 
            "nome_proprietario": "Proprietario"
        }

        try:
            response = requests.post(f"{API_URL}/portaria", json=payload)
            if response.status_code == 201:
                messagebox.showinfo("Sucesso", "Visita autorizada no sistema!")
            else:
                messagebox.showerror("Erro", f"Falha na API: {response.text}")
        except Exception as e:
            messagebox.showerror("Erro", f"Erro de conexão: {e}")

    def clear_form(self):
        self.entry_nome.delete(0, 'end')
        self.entry_cpf.delete(0, 'end')
        self.entry_tel.delete(0, 'end')
        self.btn_foto.configure(text="Selecionar Foto Facial", text_color="white")
        self.foto_path = ""

if __name__ == "__main__":
    app = GerenciamentoPortaria()
    app.mainloop()
