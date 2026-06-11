k = 0
for s in open('9.txt'):
    nums = [ int(n) for n in s.split() ]
    a,b,c,d = sorted(nums)
    if d < a+b+c:
        if a + d == b + c:
            k += 1
print(k)