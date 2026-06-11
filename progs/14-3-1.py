for x in range(1,3000):
    a = 9**150 + 9**30 - x
    
    cnt0 = 0
    while a > 0:
        cifra = a%9
        a = a//9
        if cifra == 0:
            cnt0 += 1

    if cnt0 == 122:
        print(x)
        break