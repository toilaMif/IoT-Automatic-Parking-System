from math import ceil


def calculate_fee(hours: float):
    rate = 5000
    return ceil(hours) * rate