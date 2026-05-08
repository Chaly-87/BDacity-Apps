from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"status": "Neural Strike AI Online", "message": "Sistemas prontos para lucro."}

@app.get("/predict")
def get_prediction():
    # Isso simula o sinal que o seu app vai receber
    return {
        "match": "Real Madrid vs Man City",
        "probabilidade": "68%",
        "odd_justa": 1.47,
        "sinal": "ELITE VIP",
        "valor_esperado": "+12%",
        "moeda": "EUR"
    }
